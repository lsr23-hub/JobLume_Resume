/**
 * 默认存档目录 `saves/<userId>/` —— 镜像接线的端到端实测。
 *
 * 覆盖：首屏补同步 · 增量写 · 删条目跟着删文件 · 用户之间互不串目录。
 *
 * ⚠️ 这个脚本会**真的往仓库根下的 `saves/` 写文件**（那正是被测的行为）。
 * 所以它只用自己新建的用户 id，跑完把自己建的目录删掉，绝不碰别人的。
 *
 * 前置：需要一个**从仓库根启动**的服务端（`process.cwd()` 就是存档根）。
 *   pnpm dev &
 *   pnpm e2e:saves
 */
import { chromium, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureCurrentUser, seedSaves } from "./userScope.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const SAVES_ROOT = path.join(process.cwd(), "saves");

/** 防抖 1500ms + 往返，留足余量 —— 这是等文件出现，不是在赌时序 */
const SETTLE = 2600;

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

const profilePath = (uid: string) => path.join(SAVES_ROOT, uid, "profile.json");
const resumePath = (uid: string, rid: string) => path.join(SAVES_ROOT, uid, "resumes", `${rid}.json`);
const targetPath = (uid: string, tid: string) => path.join(SAVES_ROOT, uid, "jds", `${tid}.json`);

/** 当前用户的 id，从盘上读（不经内存别名，测的就是落盘的那份） */
const currentUserId = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("career-profile-storage")!).state.currentUserId as string
  );

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 1000 } }).then((c) => c.newPage());
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const created: string[] = [];

try {
  // ════════════════ 1. 首屏补同步 ════════════════
  console.log("\n── 1. 首屏补同步 ──");
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await ensureCurrentUser(page);
  // **建完人立刻记下 id**：后面任何一步抛错，finally 里都还能把这个目录清掉。
  // （第一版是等断言跑完才记，中间一失败就在盘上留了个孤儿目录）
  const jia = await currentUserId(page);
  created.push(jia);
  await page.locator("input:visible").first().fill("甲同学");
  await page.waitForTimeout(SETTLE);

  step(await exists(profilePath(jia)), `新建用户后落盘：saves/<甲>/profile.json（${jia.slice(0, 8)}…）`);

  const jiaProfile = await readJson(profilePath(jia)).catch(() => null);
  step(jiaProfile?.basic?.name === "甲同学", `档案内容与浏览器一致（name=${jiaProfile?.basic?.name}）`);

  // ════════════════ 2. 增量写：简历与岗位各自成文件 ════════════════
  console.log("\n── 2. 增量写 ──");
  // 先种两段经历，生成简历才有内容可放
  await page.evaluate(() => {
    const KEY = "career-profile-storage";
    const raw = JSON.parse(localStorage.getItem(KEY)!);
    const p = raw.state.profiles[raw.state.currentUserId];
    const base = { tags: [], skills: [], metrics: [], hidden: false, order: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
    p.entities = {
      exp1: { ...base, id: "exp1", type: "experience", sectionId: "experience",
              title: "星图智能", subtitle: "前端工程师", dateRange: "2021.07 - 2024.03",
              description: "<ul><li>把首屏加载从 3.2s 压到 1.1s</li></ul>" },
    };
    localStorage.setItem(KEY, JSON.stringify(raw));
  });
  // 种子也要写盘：应用改成从磁盘读之后，只灌 localStorage 会失效
  await seedSaves(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE);
  step((await readJson(profilePath(jia)).catch(() => null))?.entities?.exp1?.title === "星图智能",
    "改档案后 profile.json 里的条目跟着更新");

  // 岗位：走真实 UI 建一条
  await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /新建岗位|新建投递目标/ }).first().click();
  await page.waitForTimeout(800);
  const boxes = page.locator("input:visible");
  await boxes.nth(0).fill("华泰证券");
  await boxes.nth(1).fill("高级前端工程师");
  await page.locator("textarea:visible").first().fill("任职要求：\n1. 三年以上前端经验\n2. 熟悉 React 与性能优化");
  await page.getByRole("button", { name: /^创建$/ }).first().click();
  await page.waitForTimeout(SETTLE);

  const jdFiles = await listDir(path.join(SAVES_ROOT, jia, "jds"));
  step(jdFiles.length === 1, `新建岗位后 jds/ 下出现 1 个文件（${jdFiles.join(", ") || "无"}）`);
  const jdContent = jdFiles[0] ? await readJson(path.join(SAVES_ROOT, jia, "jds", jdFiles[0])) : null;
  step(jdContent?.company === "华泰证券" && jdContent?.matchAnalysis === null,
    `岗位内容落盘且是单槽形状（company=${jdContent?.company}）`);

  // ════════════════ 3. 删条目跟着删文件 ════════════════
  console.log("\n── 3. 删条目跟着删文件 ──");
  const theJd = jdFiles[0]!;
  await page.getByRole("button", { name: /^删除$/ }).first().click();
  await page.waitForTimeout(SETTLE);
  step(!(await exists(path.join(SAVES_ROOT, jia, "jds", theJd))),
    "删掉岗位后，磁盘上那份文件也消失了（不留孤儿）");

  // ════════════════ 4. 用户之间互不串目录 ════════════════
  console.log("\n── 4. 用户隔离 ──");
  // 给甲留一条岗位，切到乙再看
  await page.getByRole("button", { name: /新建岗位|新建投递目标/ }).first().click();
  await page.waitForTimeout(800);
  const boxes2 = page.locator("input:visible");
  await boxes2.nth(0).fill("甲的公司");
  await boxes2.nth(1).fill("前端");
  await page.locator("textarea:visible").first().fill("任职要求：\n1. 三年以上前端经验");
  await page.getByRole("button", { name: /^创建$/ }).first().click();
  await page.waitForTimeout(SETTLE);

  await page.getByRole("button", { name: /切换用户/ }).first().click();
  await page.waitForTimeout(900);
  // 「新建用户」是直接建人并选中，弹窗里没有名字输入框 —— 名字要回档案页填
  await page.getByRole("button", { name: "新建用户" }).first().click();
  await page.waitForTimeout(1500);
  const yi = await currentUserId(page);
  created.push(yi);
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.locator("input:visible").first().fill("乙同学");
  await page.waitForTimeout(SETTLE);

  step(yi !== jia, `切到另一个用户（${yi.slice(0, 8)}…）`);
  step(await exists(profilePath(yi)), "乙的 profile.json 也落盘了");
  step(
    (await listDir(path.join(SAVES_ROOT, jia, "jds"))).length === 1,
    "甲的 jds/ 仍然只有自己那一条，没被乙的同步动过"
  );
  step(
    (await listDir(path.join(SAVES_ROOT, yi, "jds"))).length === 0,
    "乙名下没有任何岗位文件（乙本来就没有岗位）"
  );

  console.log("\n页面错误:", errors.length ? errors.slice(0, 4) : "无");
} finally {
  // 只删自己建的目录。递归删除在这里是安全的：路径来自刚创建的两个 uuid，
  // 且限定在 saves/ 下
  for (const uid of created) {
    await fs.rm(path.join(SAVES_ROOT, uid), { recursive: true, force: true });
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log("\n结果:", `${results.length - failed}/${results.length}`);
process.exit(failed === 0 ? 0 : 1);
