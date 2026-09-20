/**
 * 存档的端到端实测 —— **S3 之后的模型：手动保存为主。**
 *
 * 覆盖：编辑不自动写盘 · 点保存才落盘 · 未保存状态跨刷新 · 删条目跟着删文件 ·
 * 切用户前自动落盘 · 用户之间互不串目录 · 删用户后目录不复现。
 *
 * ⚠️ 这个脚本会**真的往仓库根下的 `saves/` 写文件**（那正是被测的行为）。
 * 所以它只用自己新建的用户 id，跑完把自己建的目录删掉，绝不碰别人的。
 * 为此**必须 import `./userScope.mjs`** —— 那一行顺带注册了退出时的清扫钩子。
 *
 * 前置：需要一个**从仓库根启动**的服务端，且带 `SAVES_ENABLED=1`（`pnpm dev` 自带）。
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureCurrentUser } from "./userScope.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SAVES_ROOT = path.join(process.cwd(), "saves");

/** 一次保存的往返 + 状态刷新，留足余量（这是在等落盘，不是赌时序） */
const SETTLE = 1400;
/** 比"旧的自动防抖 1500ms"更长：用来证明编辑之后**不会**自己写盘 */
const NO_AUTO_SAVE_WAIT = 2200;

const results: Array<{ ok: boolean; msg: string }> = [];
const step = (ok: boolean, msg: string) => {
  results.push({ ok, msg });
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

const readJson = async (p: string): Promise<any> => JSON.parse(await fs.readFile(p, "utf8"));
const exists = (p: string) => fs.access(p).then(() => true, () => false);
const listDir = async (p: string) => {
  try {
    return (await fs.readdir(p)).sort();
  } catch {
    return [];
  }
};
/** 文件的写入时刻 + 内容。用来断言"这个文件**没有**被动过" */
const stamp = async (p: string) => {
  const st = await fs.stat(p);
  return { mtime: st.mtimeMs, text: await fs.readFile(p, "utf8") };
};

const profilePath = (uid: string) => path.join(SAVES_ROOT, uid, "profile.json");
const targetPath = (uid: string, tid: string) => path.join(SAVES_ROOT, uid, "jds", `${tid}.json`);
const userDir = (uid: string) => path.join(SAVES_ROOT, uid);

const currentUserId = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("career-profile-storage")!).state.currentUserId as string
  );

/** 手改磁盘上那份档案的名字 —— 模拟"用户直接在编辑器里改了文件" */
const renameOnDisk = async (file: string, name: string) => {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  data.basic.name = name;
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
};
const diskName = async (file: string) => (await readJson(file)).basic?.name;
const uiName = (page: Page) => page.locator("input:visible").first().inputValue();

/** 点全局徽标上的保存入口 —— 工作台侧边栏与编辑器头部都挂着它 */
const saveNow = async (page: Page) => {
  const badge = page.getByRole("button", { name: /未保存|写入磁盘失败/ }).first();
  // ⚠️ **要等它出现**：脏集是防抖刷新的（300ms），改完立刻查会误判成"没有要保存的"，
  // 于是这一保存被静默跳过 —— 后面所有读盘的断言就都在看旧内容（实测踩过）
  const appeared = await badge
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return; // 真的干净
  await badge.click();
  await page.waitForTimeout(SETTLE);
};

const seen = (page: Page, text: string) =>
  page.getByText(text, { exact: false }).first().isVisible().catch(() => false);

/** 点侧边栏切板块。**有未落盘改动时会弹离开对话框**，这里默认选「直接离开」 */
const navTo = async (page: Page, label: string, choice = "直接离开") => {
  await page.getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(900);
  const button = page.getByRole("button", { name: choice }).first();
  if ((await button.count()) > 0) {
    await button.click();
    await page.waitForTimeout(1300);
  }
};

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then((c) => c.newPage());
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const created: string[] = [];

try {
  // ════════════════ 1. 首屏不写盘 ════════════════
  console.log("\n── 1. 首屏不写盘（旧的全量重写已消失）──");
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ensureCurrentUser(page);
  // **建完人立刻记下 id**：后面任何一步抛错，finally 里都还能把这个目录清掉
  const jia = await currentUserId(page);
  created.push(jia);

  await page.locator("input:visible").first().fill("甲同学");
  await saveNow(page);
  step(await exists(profilePath(jia)), `点保存后落盘：saves/<甲>/profile.json（${jia.slice(0, 8)}…）`);
  step((await readJson(profilePath(jia))).basic?.name === "甲同学", "档案内容与浏览器一致");

  const afterFirstSave = await stamp(profilePath(jia));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(NO_AUTO_SAVE_WAIT);
  const afterReload = await stamp(profilePath(jia));
  step(
    afterReload.mtime === afterFirstSave.mtime,
    "**重新打开页面没有重写文件** —— 旧模型下每次开机都会把全部文件重写一遍"
  );

  // ════════════════ 2. 编辑不自动写盘 ════════════════
  console.log("\n── 2. 编辑不自动写盘 ──");
  await page.locator("input:visible").first().fill("甲同学改");
  await page.waitForTimeout(NO_AUTO_SAVE_WAIT);
  step(
    (await stamp(profilePath(jia))).mtime === afterFirstSave.mtime,
    `编辑后等 ${NO_AUTO_SAVE_WAIT}ms，磁盘**没有**被动过（自动写盘已退役）`
  );
  step(await seen(page, "未保存"), "界面如实显示「未保存 N 处」");

  // ════════════════ 3. 点保存才落盘 ════════════════
  console.log("\n── 3. 点保存才落盘 ──");
  await saveNow(page);
  step((await readJson(profilePath(jia))).basic?.name === "甲同学改", "点保存后盘上是新内容");
  step(await seen(page, "改动已写入磁盘"), "状态回到「改动已写入磁盘」");
  step(!(await seen(page, "未保存")), "「未保存」消失");

  // ════════════════ 4. 关页面时的兜底刷盘（时机 ④）════════════════
  console.log("\n── 4. 关页面时尽力刷一次 ──");
  await page.locator("input:visible").first().fill("甲同学再改");
  await page.waitForTimeout(700);
  await page.reload({ waitUntil: "networkidle" }); // 刷新会触发 pagehide
  await page.waitForTimeout(1500);
  step(
    (await readJson(profilePath(jia))).basic?.name === "甲同学再改",
    "刷新时 `pagehide` 用 sendBeacon 把改动送下去了（没点保存也没丢）"
  );
  step(!(await seen(page, "未保存")), "而且它是真存上了 —— 重新打开是干净的，不是「以为存了」");

  // ════════════════ 4b. 卸载时刷不上去，下次打开仍认得它没存 ════════════════
  console.log("\n── 4b. 卸载刷盘失败 → 下次打开仍显示未保存 ──");
  await page.locator("input:visible").first().fill("甲同学第三改");
  await page.waitForTimeout(700);
  // 模拟"卸载那一刻刷不上去"：离线 / 服务端挂了 / 载荷超过 sendBeacon 的上限。
  // 这时脏集必须能从**服务端的基线 + 本地内容**重新算出来，而不是靠内存里剩下的
  await page.route("**/api/saves", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue()
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.unroute("**/api/saves");
  await page.waitForTimeout(1800);
  step(await seen(page, "未保存"), "仍显示「未保存」—— 脏集是重算的，不是内存残留");
  step(
    (await readJson(profilePath(jia))).basic?.name !== "甲同学第三改",
    "盘上确实还是旧的（这一笔没送出去）"
  );
  await saveNow(page);
  step((await readJson(profilePath(jia))).basic?.name === "甲同学第三改", "再点保存就补上了");

  // ════════════════ 5. 删条目跟着删文件 ════════════════
  console.log("\n── 5. 删条目跟着删文件 ──");
  await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /新建岗位|新建投递目标/ }).first().click();
  await page.waitForTimeout(800);
  const boxes = page.locator("input:visible");
  await boxes.nth(0).fill("华泰证券");
  await boxes.nth(1).fill("高级前端工程师");
  await page.locator("textarea:visible").first().fill("任职要求：\n1. 三年以上前端经验");
  await page.getByRole("button", { name: /^创建$/ }).first().click();
  await page.waitForTimeout(800);

  // 岗位页没有保存栏 —— 用全局徽标保存（它同时是这两个时机的入口）
  await saveNow(page);
  const jdFiles = await listDir(path.join(userDir(jia), "jds"));
  step(jdFiles.length === 1, `新建岗位并保存后 jds/ 下出现 1 个文件（${jdFiles.join(", ") || "无"}）`);
  const jdContent = jdFiles[0] ? await readJson(targetPath(jia, jdFiles[0]!.replace(/\.json$/, ""))) : null;
  step(
    jdContent?.company === "华泰证券" && jdContent?.matchAnalysis === null,
    `岗位内容落盘且是单槽形状（company=${jdContent?.company}）`
  );

  const theJd = jdFiles[0]!;
  await page.getByRole("button", { name: /^删除$/ }).first().click();
  await page.waitForTimeout(800);
  await saveNow(page);
  step(!(await exists(path.join(userDir(jia), "jds", theJd))), "删掉岗位并保存后，磁盘上那份文件也消失了");

  // ════════════════ 6. 切用户前自动落盘 ════════════════
  console.log("\n── 6. 切用户前自动落盘 ──");
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("input:visible").first().fill("甲同学切前改");
  await page.waitForTimeout(500); // 故意不点保存

  await page.getByRole("button", { name: /切换用户/ }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "新建用户" }).first().click();
  await page.waitForTimeout(2000);
  const yi = await currentUserId(page);
  created.push(yi);
  step(yi !== jia, `切到另一个用户（${yi.slice(0, 8)}…）`);
  step(
    (await readJson(profilePath(jia))).basic?.name === "甲同学切前改",
    "切走的那个用户的改动被自动落盘了（时机 ②）"
  );

  // ════════════════ 7. 用户之间互不串目录 ════════════════
  console.log("\n── 7. 用户隔离 ──");
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("input:visible").first().fill("乙同学");
  await saveNow(page);
  step(await exists(profilePath(yi)), "乙的 profile.json 也落盘了");
  step(
    (await listDir(path.join(userDir(jia), "jds"))).length === 0,
    "甲的 jds/ 里没有乙的东西，也没被乙的保存动过"
  );
  step(
    (await readJson(profilePath(jia))).basic?.name === "甲同学切前改",
    "甲的档案仍是甲的内容"
  );

  // ════════════════ 9. 离开守卫（时机 ⑤）════════════════
  console.log("\n── 9. 离开守卫 ──");
  // ⚠️ 这里**不能假设当前是甲** —— §7 结束时当前用户已经是乙了。
  // 按当前用户动态取，否则断言会读到别人的文件（写这段时踩过一次）
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const guardUid = await currentUserId(page);
  const guardPath = profilePath(guardUid);
  const nameBefore = (await readJson(guardPath)).basic?.name;
  await page.locator("input:visible").first().fill("离开守卫测试");
  await page.waitForTimeout(700);

  await page.getByText("投递目标", { exact: true }).first().click();
  await page.waitForTimeout(1000);
  step(await seen(page, "还有 1 处改动没写入磁盘"), "有未落盘改动时切板块 → 弹出对话框并报出数量");
  step(!/\/targets/.test(page.url()), "还没跳走（在等用户选择）");
  step(await seen(page, "改动仍在浏览器里"), "文案说清了磁盘上还是旧内容");

  await page.getByRole("button", { name: "取消" }).first().click();
  await page.waitForTimeout(700);
  step(/\/profile/.test(page.url()) && (await seen(page, "未保存")), "取消 → 留在原页且改动还在");

  await navTo(page, "投递目标");
  step(/\/targets/.test(page.url()), "「直接离开」跳走了");
  step(
    (await readJson(guardPath)).basic?.name === nameBefore,
    `磁盘上仍是旧内容（这次没写盘，还是「${nameBefore}」）`
  );
  const localAfterLeave = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("career-profile-storage")!).state;
    return state.profiles[state.currentUserId]?.basic?.name;
  });
  step(localAfterLeave === "离开守卫测试", "**改动留在浏览器里** —— 「直接离开」不是「丢弃」");

  await navTo(page, "职业数据库");
  await page.locator("input:visible").first().fill("保存后离开测试");
  await page.waitForTimeout(700);
  await page.getByText("投递目标", { exact: true }).first().click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "保存并离开" }).first().click();
  await page.waitForTimeout(1800);
  step(/\/targets/.test(page.url()), "「保存并离开」跳走了");
  step((await readJson(guardPath)).basic?.name === "保存后离开测试", "而且盘上确实是新内容");

  // ════════════════ 10. 启动读回：手改文件生效 · 冲突（S4）════════════════
  console.log("\n── 10. 启动读回 ──");
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const readUid = await currentUserId(page);
  const readPath = profilePath(readUid);
  await page.locator("input:visible").first().fill("读回测试");
  await saveNow(page);
  step((await diskName(readPath)) === "读回测试", "前置：保存成功，盘上是「读回测试」");

  // 手改磁盘文件 → 重新打开应当生效。**这是 S4 存在的理由**：
  // 「文件夹就是我的数据」—— 在编辑器里改它，应用要认
  await renameOnDisk(readPath, "磁盘上手改的");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  step((await uiName(page)) === "磁盘上手改的", "**手改 `profile.json` 后重新打开 → 界面显示磁盘上的内容**");

  // 两边都改 → 冲突。拦掉 POST 来模拟"本地这一笔没存上"
  await page.route("**/api/saves", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue()
  );
  await page.locator("input:visible").first().fill("浏览器改的");
  await page.waitForTimeout(800);
  await renameOnDisk(readPath, "磁盘也改了");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  step(await seen(page, "处冲突"), "两边都改过 → 弹出冲突对话框");
  step((await uiName(page)) === "浏览器改的", "冲突期间**两边都不动**：界面保持本地那份");
  step((await diskName(readPath)) === "磁盘也改了", "磁盘那份也原样没动（等用户选）");
  await page.getByRole("button", { name: "保留磁盘" }).first().click();
  await page.waitForTimeout(1300);
  step((await uiName(page)) === "磁盘也改了", "「保留磁盘」→ 以磁盘那份为准，且对话框关闭");
  await page.unroute("**/api/saves");

  // ════════════════ 8. 删用户 → 目录消失且不复现 ════════════════
  console.log("\n── 8. 删用户 → 目录不复现 ──");
  await page.getByRole("button", { name: /切换用户/ }).first().click();
  await page.waitForTimeout(900);
  // 按当前用户的名字找卡片：写死名字的话，前面哪一节改了名就会找不到（踩过）
  const victimName = (await readJson(profilePath(yi))).basic?.name;
  const card = page
    .locator('[role="dialog"] [role="button"]')
    .filter({ hasText: victimName })
    .first();
  await card.hover();
  await page.waitForTimeout(200);
  // ⚠️ 删除按钮**必须限定在这张卡片内**。用全局 `.first()` 会点到 DOM 里第一张卡的
  // 删除按钮 —— 删掉的是别人，而症状是「被删用户的目录没消失」，极容易误判成竞态
  await card.getByRole("button", { name: "删除用户" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "删除" }).last().click();
  await page.waitForTimeout(2500);

  step(!(await exists(userDir(yi))), `删用户后 saves/<uid>/ 消失（${yi.slice(0, 8)}…）`);
  await page.waitForTimeout(1500);
  step(!(await exists(userDir(yi))), "再等一会儿也没被写回来");

  console.log("\n页面错误:", errors.length ? errors.slice(0, 4) : "无");
} finally {
  // 只删自己建的目录。递归删除在这里是安全的：路径来自刚创建的 uuid，且限定在 saves/ 下
  for (const uid of created) {
    await fs.rm(userDir(uid), { recursive: true, force: true });
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log("\n结果:", `${results.length - failed}/${results.length}`);
process.exit(failed === 0 ? 0 : 1);
