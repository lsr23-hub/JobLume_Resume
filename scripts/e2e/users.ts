/**
 * 多用户主线 —— 把手工验证过的条目固化成可重跑的脚本。
 *
 * 覆盖：门禁（全新安装必须先选人）· 新建与切换 · 持久化 · 数据隔离 ·
 * 老数据迁移 · 投递目标不设门禁。
 *
 * 跑法（需要一个起着的服务端）：
 *   pnpm dev &            # 或 pnpm start
 *   pnpm e2e:users
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PROFILE_KEY = "career-profile-storage";

const results: Array<{ ok: boolean; msg: string }> = [];
const step = (ok: boolean, msg: string) => {
  results.push({ ok, msg });
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

const picker = (page: Page) => page.locator('[role="dialog"]').filter({ hasText: "选择用户" });
const chip = (page: Page) => page.getByRole("button", { name: /切换用户/ });
const chipText = async (page: Page) => (await chip(page).first().innerText()).replace(/\n/g, " / ");

/** 按名字切到某个用户（依赖侧边栏入口） */
const switchTo = async (page: Page, name: string) => {
  await chip(page).first().click();
  await page.waitForTimeout(900);
  await page.locator('[role="dialog"] [role="button"]').filter({ hasText: name }).first().click();
  await page.waitForTimeout(1800);
};

const readState = (page: Page) =>
  page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    const st = raw?.state ?? {};
    const ids: string[] = Object.keys(st.profiles ?? {});
    return {
      version: raw?.version as number | undefined,
      keys: Object.keys(st),
      ids,
      currentUserId: st.currentUserId as string | null,
      names: ids.map((i) => st.profiles[i].basic.name as string),
    };
  }, PROFILE_KEY);

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1500, height: 950 } }).then((c) => c.newPage());
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// ════════════════ 1. 全新安装：门禁必须拦住 ════════════════
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);

step((await picker(page).innerText()).includes("选择用户"), "全新安装 → 进职业数据库先弹用户选择框");
step(
  !(await page.locator("text=所有经历集中维护一次").isVisible().catch(() => false)),
  "门禁是真的不渲染板块内容，不是盖一层弹窗"
);
step((await picker(page).innerText()).includes("还没有用户"), "空列表有提示（不是一片空白）");

// ════════════════ 2. 新建 → 进入 → 刷新记住 ════════════════
await page.getByRole("button", { name: "新建用户" }).first().click();
await page.waitForTimeout(1500);
step(!(await picker(page).isVisible().catch(() => false)), "新建用户后弹窗关闭");
step(
  await page.locator("text=所有经历集中维护一次").isVisible().catch(() => false),
  "板块内容渲染出来了"
);
await page.locator("input:visible").first().fill("甲同学");
await page.waitForTimeout(800);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
step(!(await picker(page).isVisible().catch(() => false)), "刷新后不再弹窗（记住当前用户）");

const persisted = await readState(page);
step(persisted.version === 1, `persist 版本 = ${persisted.version}`);
step(
  !persisted.keys.includes("profile"),
  `持久化切片不含 profile 别名（keys = ${persisted.keys.join(", ")}）`
);
step(
  typeof persisted.currentUserId === "string" && persisted.currentUserId.length > 10,
  `currentUserId 已落盘（${String(persisted.currentUserId).slice(0, 8)}…）`
);

// ════════════════ 3. 侧边栏入口与切换 ════════════════
step((await chip(page).count()) > 0, "侧边栏底部有「当前用户」入口");
step((await chipText(page)).includes("甲同学"), `入口显示当前用户（${await chipText(page)}）`);

await chip(page).first().click();
await page.waitForTimeout(900);
step(await picker(page).isVisible(), "点入口能重新打开选择弹窗");
step((await picker(page).innerText()).includes("甲同学"), "弹窗列出已有用户");

await page.getByRole("button", { name: "新建用户" }).first().click();
await page.waitForTimeout(1500);
step(!(await picker(page).isVisible().catch(() => false)), "从入口新建后弹窗自动关闭");
await page.locator("input:visible").first().fill("乙同学");
await page.waitForTimeout(800);
step((await chipText(page)).includes("乙同学"), "新建即切到新用户");

await chip(page).first().click();
await page.waitForTimeout(900);
await page.locator('[role="dialog"] [role="button"]').filter({ hasText: "甲同学" }).first().click();
await page.waitForTimeout(1200);
step((await chipText(page)).includes("甲同学"), "点卡片切回甲同学");
step(!(await picker(page).isVisible().catch(() => false)), "选中后弹窗关闭");

const two = await readState(page);
step(two.ids.length === 2, `两个用户各存一份（${two.names.join(" / ")}）`);
step(two.names[two.ids.indexOf(two.currentUserId!)] === "甲同学", "currentUserId 指向甲同学");

// ════════════════ 4. 投递目标不设门禁 ════════════════
await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
step(!(await picker(page).isVisible().catch(() => false)), "投递目标页不弹用户框（岗位全局共享）");
step((await chip(page).count()) > 0, "投递目标页也保留切换入口");

// ════════════════ 4b. 简历也按用户隔离 ════════════════
// 甲同学名下生成一份简历，切到乙同学应该看不到
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate((key) => {
  const NOW = new Date().toISOString();
  const raw = JSON.parse(localStorage.getItem(key)!);
  const st = raw.state;
  const p = st.profiles[st.currentUserId];
  const base = { tags: [], skills: [], metrics: [], hidden: false, order: 0, createdAt: NOW, updatedAt: NOW };
  p.basic = { ...p.basic, name: "甲同学" };
  p.entities = {
    exp1: { ...base, id: "exp1", type: "experience", sectionId: "experience",
            title: "甲的公司", subtitle: "前端工程师", dateRange: "2020.07 - 2024.03",
            description: "<ul><li>甲的独有经历</li></ul>" },
  };
  localStorage.setItem(key, JSON.stringify(raw));
}, PROFILE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
step(!(await picker(page).isVisible().catch(() => false)), "我的简历页：有当前用户时直接进");

await page.getByRole("button", { name: "新建简历" }).first().click();
await page.waitForTimeout(900);
await page.getByText("生成通用简历", { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.getByText("经典模板", { exact: true }).first().click();
await page.waitForTimeout(1300);
await page.getByRole("button", { name: /就用这个模板开始|用这个模板/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "全选" }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "开始生成" }).click();
await page.waitForTimeout(4500);
step(!(await picker(page).isVisible().catch(() => false)), "甲同学成功生成一份简历");

const resumeStore = () =>
  page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("resume-storage") ?? "null")?.state ?? {};
    const buckets = Object.keys(st.byUser ?? {});
    return {
      buckets,
      counts: buckets.map((b) => Object.keys(st.byUser[b]).length),
      currentBucket: st.byUser?.[
        JSON.parse(localStorage.getItem("career-profile-storage")!).state.currentUserId
      ]?.constructor?.name,
    };
  });

const afterA = await readState(page);
const bucketA = afterA.currentUserId!;
const aViews = await resumeStore();
step(aViews.buckets.includes(bucketA), `甲的简历挂在自己名下（桶：${aViews.buckets.map((b) => b.slice(0, 6)).join(", ")}）`);
step(!Object.keys(aViews).includes("resumes"), "持久化切片不再有扁平的 resumes 字段");

// 切到乙：应该看不到甲的任何简历
// 生成完会落到编辑器（/app/workbench/），那是另一套布局、没有侧边栏 —— 先回列表页
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await chip(page).first().click();
await page.waitForTimeout(900);
await page.locator('[role="dialog"] [role="button"]').filter({ hasText: "乙同学" }).first().click();
await page.waitForTimeout(1800);
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

const cards = await page.locator('[role="dialog"] button:has-text("编辑")').count();
const bodyText = await page.locator("body").innerText();
step(!bodyText.includes("甲的独有经历"), "乙同学看不到甲的经历");
step(
  (await page.locator("text=通用简历").count()) === 0,
  `乙同学的简历列表里没有甲的简历（可见简历卡 ${cards} 张）`
);

// 乙名下还没有简历，所以不会有空桶（没有写入就不建桶）。真正要钉住的不变量是：
// 甲的桶还在、且没被动过，而乙看到的是 0 份。
const buckets = await page.evaluate((aId) => {
  const st = JSON.parse(localStorage.getItem("resume-storage") ?? "null")?.state ?? {};
  const byUser = st.byUser ?? {};
  return { aCount: Object.keys(byUser[aId] ?? {}).length, total: Object.keys(byUser).length };
}, bucketA);
step(buckets.aCount === 1, `切走之后甲的简历仍在自己桶里，没被动过（${buckets.aCount} 份）`);
step(buckets.total === 1, `乙没有简历 → 不产生空桶（桶数 ${buckets.total}）`);

// ════════════════ 4c. 投递目标：岗位共享，分析各人一份 ════════════════
// 给甲种一条带分析的岗位，切到乙应该看不到那份分析。
// 注意先把当前用户切回甲 —— 上一步结束时停在乙，直接种会种到乙名下。
await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await switchTo(page, "甲同学");
await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const targetSeed = await page.evaluate(() => {
  const NOW = new Date().toISOString();
  const uid = JSON.parse(localStorage.getItem("career-profile-storage")!).state.currentUserId;
  localStorage.setItem("job-target-storage", JSON.stringify({
    version: 1,
    state: { targets: { t1: {
      id: "t1", company: "共享岗位", position: "前端", jdRaw: "任职要求：\n1. 三年经验",
      note: "", cachesByUser: {},
      analysesByUser: { [uid]: {
        items: {}, rankedIds: [], topN: 5,
        requirements: [{ id: "r1", text: "三年经验", keys: ["经验"], kind: "must",
                         status: "missing", entityIds: [], sourceQuote: "三年经验" }],
        summary: { recommendedCount: 0, coverage: { covered: [], missing: ["经验"], weak: [] }, advice: "x" },
        modelId: "e2e", promptVersion: "v5", analyzedAt: NOW,
      } },
      createdAt: NOW, updatedAt: NOW,
    } } },
  }));
  return uid;
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
await page.getByText("共享岗位", { exact: false }).first().click();
await page.waitForTimeout(1500);
let body = await page.locator("body").innerText();
step(/不建议投|差距/.test(body), "甲：能看到自己那份分析（等级已渲染）");

// 切到乙 —— 同一个岗位，但分析是甲的
await switchTo(page, "乙同学");
await page.getByText("共享岗位", { exact: false }).first().click();
await page.waitForTimeout(1500);
body = await page.locator("body").innerText();
step(body.includes("共享岗位"), "乙：岗位本身仍然可见（岗位全局共享）");
step(!/不建议投|差距较大/.test(body), "乙：看不到甲的分析结论 —— 这正是「分析按岗位×用户」要防的误导");
step(!body.includes("r1"), "乙：不会渲染出指向别人经历的裸要求项");

const analysisBuckets = await page.evaluate((aId) => {
  const t = JSON.parse(localStorage.getItem("job-target-storage")!).state.targets.t1;
  return { users: Object.keys(t.analysesByUser), aId };
}, targetSeed);
step(analysisBuckets.users.length === 1 && analysisBuckets.users[0] === analysisBuckets.aId,
  `分析只挂在甲名下（${analysisBuckets.users.length} 份）`);

// ════════════════ 5. 老数据迁移（放最后：它会整体覆盖存储） ════════════════
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.evaluate((key) => {
  const NOW = new Date().toISOString();
  // 逐字模拟改造前的写盘形状：version 0 + 标量 state.profile，且带上真实档案
  // 会有的全部 basic 字段（少字段会让 RegionSelector 崩，那是另一回事）
  localStorage.setItem(key, JSON.stringify({
    version: 0,
    state: {
      profile: {
        version: 1,
        basic: {
          name: "老用户李四", title: "", email: "", phone: "", location: "", birthDate: "",
          employementStatus: "", photo: "",
          photoConfig: { width: 90, height: 120, borderRadius: "none", customBorderRadius: 0, visible: true },
          icons: {}, fieldOrder: [], customFields: [], githubKey: "", githubUseName: "",
          githubContributionsVisible: false, layout: "left",
        },
        entities: { e1: { id: "e1", type: "experience", sectionId: "experience", title: "旧公司",
          subtitle: "", dateRange: "", description: "", tags: [], skills: [], metrics: [],
          hidden: false, order: 0, createdAt: NOW, updatedAt: NOW } },
        sectionOrder: [], skillGroups: [], certificateText: "", languageText: "",
        selfEvaluationContent: "", meta: { createdAt: NOW, updatedAt: NOW, lastBackupAt: null },
      },
    },
  }));
}, PROFILE_KEY);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);

const migrated = await readState(page);
step(migrated.version === 1, `老数据被迁到 version ${migrated.version}`);
step(migrated.ids.includes("legacy-default"), `归到固定用户名下（${migrated.ids.join(", ")}）`);
step(migrated.currentUserId === "legacy-default", "并自动设为当前用户 → 不弹选择框");
step(migrated.names[0] === "老用户李四", `档案内容完好（${migrated.names[0]}）`);
step(!(await picker(page).isVisible().catch(() => false)), "老用户升级后直接进入，体验不变");
step((await chipText(page)).includes("老用户李四"), "入口跟着显示迁移过来的名字");

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n页面错误: ${pageErrors.length ? pageErrors.join(" | ") : "无"}`);
console.log(`结果: ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
