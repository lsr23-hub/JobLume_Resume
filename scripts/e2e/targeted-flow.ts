/**
 * 岗位专用简历全流程 —— 覆盖模块重划后的新链路。
 *
 * 投递目标页（只做 JD 分析） → 我的简历 → 生成岗位专用简历 → 内容选择 → 生成
 *
 * 用 `.ts` 而不是 `.mjs`：种进去的分析结果**由真实的 `validateMatchResult` 生成**，
 * 不是手抄一份形状。手抄的种子会在校验器演进后静默失真 —— 那时测的是一份
 * 早已不存在的契约。
 *
 * 跑法（需要一个起着的服务端）：
 *   pnpm dev &            # 或 pnpm start
 *   pnpm e2e:targeted
 */
import { chromium, type Page } from "playwright";
import { ensureCurrentUser } from "./userScope.mjs";
import fs from "node:fs";
import { validateMatchResult } from "../../src/lib/match/validateMatchResult";
import { PROMPT_VERSION } from "../../src/lib/match/buildMatchPrompt";
import type { ProfileEntity } from "../../src/types/profile";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp/jl2";
fs.mkdirSync(OUT, { recursive: true });

const results: Array<{ ok: boolean; msg: string }> = [];
const step = (ok: boolean, msg: string) => {
  results.push({ ok, msg });
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

const NOW = new Date().toISOString();
const JD =
  "【任职要求】\n1. 3 年以上前端开发经验\n2. 有从零搭建项目的经验\n\n【加分项】\n有开源贡献";

const baseEntity = (over: Partial<ProfileEntity>): ProfileEntity =>
  ({
    tags: [], skills: [], metrics: [], hidden: false, order: 0,
    createdAt: NOW, updatedAt: NOW, description: "", ...over,
  }) as ProfileEntity;

const ENTITIES: ProfileEntity[] = [
  baseEntity({ id: "exp1", type: "experience", sectionId: "experience", title: "示例科技",
    subtitle: "前端工程师", dateRange: "2020.07 - 2024.03",
    description: "<ul><li>负责核心业务前端开发，页面性能提升 40%</li></ul>" }),
  baseEntity({ id: "proj1", type: "project", sectionId: "projects", title: "职光简历 JobLume",
    subtitle: "独立开发", dateRange: "2026.01 - 2026.09",
    description: "<ul><li>从零搭建，已开源</li></ul>" }),
  baseEntity({ id: "proj2", type: "project", sectionId: "projects", title: "无关项目",
    subtitle: "协作", dateRange: "2025.01 - 2025.06",
    description: "<ul><li>内部工具</li></ul>" }),
];

// 模型原始输出（模拟一次真实分析），交给校验器处理
const RAW = {
  requirements: [
    { id: "r1", text: "3 年以上前端开发经验", keys: ["前端"], kind: "must",
      status: "covered", entityIds: ["exp1"], sourceQuote: "3 年以上前端开发经验" },
    { id: "r2", text: "有从零搭建项目的经验", keys: ["项目"], kind: "must",
      status: "covered", entityIds: ["proj1"], sourceQuote: "有从零搭建项目的经验" },
    { id: "r3", text: "有开源贡献", keys: ["开源"], kind: "nice",
      status: "covered", entityIds: ["proj1"], sourceQuote: "有开源贡献" },
    { id: "r4", text: "熟悉 Rust 系统编程", keys: ["Rust"], kind: "must",
      status: "missing", entityIds: [], sourceQuote: "" },
  ],
  items: [
    { id: "exp1", reason: "对应「3 年以上前端经验」", matchedSkills: ["React"], requirementIds: ["r1"] },
    { id: "proj1", reason: "对应「从零搭建」与「开源贡献」", matchedSkills: ["TypeScript"], requirementIds: ["r2", "r3"] },
    { id: "proj2", reason: "与岗位要求关系不大", matchedSkills: [], requirementIds: [] },
  ],
  summary: { advice: "前端经验扎实，但缺系统编程经历" },
};

// topN 特意设成 2（默认是 5，而这里只有 3 条经历）—— 三条全打星的话
// 「★ 数 == AI 推荐数」这条断言恒真，测不出任何东西
const { analysis } = validateMatchResult(RAW, {
  entities: ENTITIES, jdRaw: JD, modelId: "seed", promptVersion: PROMPT_VERSION,
  analyzedAt: NOW, topN: 2,
});
const topNCount = analysis.rankedIds.filter((id) => analysis.items[id]?.inTopN).length;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page: Page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const seed = async () => {
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await ensureCurrentUser(page);
  await page.waitForTimeout(1200);
  await page.evaluate(
    ({ now, entities, jd, analysis }) => {
      const raw = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null");
      if (!raw) throw new Error("career-profile-storage 未初始化");
      const p = raw.state.profiles[raw.state.currentUserId];
      p.basic = { ...p.basic, name: "林可", title: "前端工程师" };
      p.entities = Object.fromEntries(entities.map((e) => [e.id, e]));
      localStorage.setItem("career-profile-storage", JSON.stringify(raw));
      // 分析按「岗位 × 用户」存 —— 必须种在**当前用户**名下。
      // 用旧的单槽形状种下去的话，迁移会把它归到 LEGACY_USER_ID，
      // 而 ensureCurrentUser 建的是另一个 id，于是界面上一片空白。
      const uid = raw.state.currentUserId;
      localStorage.setItem(
        "job-target-storage",
        JSON.stringify({
          state: {
            targets: {
              t1: { id: "t1", company: "华泰证券", position: "高级前端工程师", jdRaw: jd,
                    note: "", analysesByUser: { [uid]: analysis }, cachesByUser: {},
                    createdAt: now, updatedAt: now },
            },
          },
          version: 1,
        })
      );
    },
    { now: NOW, entities: ENTITIES, jd: JD, analysis }
  );
};

await seed();

// ── 1. 投递目标页：只做分析 ──
await page.goto(`${BASE}/app/dashboard/targets`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByText("华泰证券", { exact: false }).first().click();
await page.waitForTimeout(1500);
const tTxt = await page.evaluate(() => document.body.innerText);
step(!tTxt.includes("但本次未勾选"), "① 投递目标页不再出现「但本次未勾选」");
step((await page.locator("input[type=checkbox]").count()) === 0, "② 投递目标页没有勾选框");
step(!tTxt.includes("开始生成") && !/\n生成简历(\n|$)/.test(tTxt), "③ 投递目标页没有生成按钮");
// r4 是 missing → gap
step(tTxt.includes("差距较大"), "④ 投递目标页显示适配度等级（差距较大）");
step(tTxt.includes("JD 要求"), "⑤ 投递目标页仍显示要求项明细");
await page.screenshot({ path: `${OUT}/targeted-1-targets.png` });

// ── 2. 岗位专用简历 → 内容选择 ──
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "新建简历" }).first().click();
await page.waitForTimeout(1000);
await page.getByText("岗位专用简历", { exact: false }).first().click();
await page.waitForTimeout(1000);
await page.getByText("华泰证券", { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.getByText("经典模板", { exact: true }).first().click();
await page.waitForTimeout(1500);
for (const l of [/就用这个模板开始/, /用这个模板/]) {
  const b = page.getByRole("button", { name: l });
  if ((await b.count()) && (await b.first().isVisible().catch(() => false))) { await b.first().click(); break; }
}
await page.waitForTimeout(3500);

const cTxt = await page.evaluate(() => document.body.innerText);
step(cTxt.includes("选择放进这份简历的内容"), "⑥ 进入内容选择步");
const boxes = await page.locator("input[type=checkbox]").count();
const checkedN = await page.locator("input[type=checkbox]:checked").count();
step(boxes > 0 && checkedN === 0, `⑦ 有分析时初始不预勾选（${boxes} 个勾选框，已勾 ${checkedN}）`);
const stars = await page.locator("svg.lucide-star").count();
step(
  stars === topNCount && stars > 0 && stars < boxes,
  `⑧ ★ 数等于 AI 排在前列的数，且不是全部（★${stars} / 共 ${boxes} 条）`
);
await page.screenshot({ path: `${OUT}/targeted-2-content.png` });

// ── 3. 「勾选 AI 推荐条目」是按钮，点了才勾 ──
await page.getByRole("button", { name: "勾选 AI 推荐条目" }).click();
await page.waitForTimeout(800);
const afterCheck = await page.locator("input[type=checkbox]:checked").count();
step(afterCheck === stars, `⑨ 点按钮后勾中数恰等于 ★ 数（${afterCheck}）`);

// ── 4. 清空后手工勾一条 + 关板块 ──
await page.getByRole("button", { name: "清空" }).click();
await page.waitForTimeout(600);
step((await page.locator("input[type=checkbox]:checked").count()) === 0, "⑩ 清空生效");
await page.locator("input[type=checkbox]").first().check();
await page.waitForTimeout(500);
const projSwitch = page.locator("label").filter({ hasText: "项目经历" }).locator("button[role=switch]").first();
if (await projSwitch.count()) { await projSwitch.click(); await page.waitForTimeout(500); }

// ── 5. 生成 ──
await page.getByRole("button", { name: "开始生成" }).click();
await page.waitForTimeout(6000);
step(/\/app\/workbench\//.test(page.url()), "⑪ 生成后进入编辑器");

const snap = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("resume-storage") ?? "null");
  const st = raw?.state ?? {};
  // 简历按用户分桶（见 store/userScope）：取当前用户那一桶。
  // 注意 currentUserId 存在 career-profile-storage 里，不在 resume-storage。
  const uid = JSON.parse(
    localStorage.getItem("career-profile-storage") ?? "null"
  )?.state?.currentUserId as string | undefined;
  const list = Object.values((st.byUser?.[uid ?? ""] ?? {}) as Record<string, unknown>);
  const r = (list as Array<Record<string, unknown>>).sort(
    (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
  )[0] as { snapshot?: Record<string, unknown>; menuSections?: Array<{ id: string; enabled: boolean }> };
  if (!r) return null;
  const sel = (r.snapshot?.selectedEntityIds ?? {}) as Record<string, string[]>;
  return {
    mode: r.snapshot?.mode,
    targetId: r.snapshot?.jobTargetId,
    flat: Object.values(sel).flat(),
    projectsEnabled: r.menuSections?.find((s) => s.id === "projects")?.enabled,
    hasManuallyAdjusted: r.snapshot ? "manuallyAdjustedIds" in r.snapshot : null,
  };
});
step(snap?.mode === "targeted" && snap?.targetId === "t1", "⑫ 快照记录了岗位专用模式与目标");
step((snap?.flat.length ?? -1) === 1, `⑬ 快照里的选中条目与页面勾选一致（${snap?.flat.length} 条）`);
step(snap?.projectsEnabled === false, "⑭ 板块开关真的生效（项目经历已关）");
step(snap?.hasManuallyAdjusted === false, "⑮ 快照里不再有已删的 manuallyAdjustedIds");

console.log("\n页面错误:", errors.length ? errors.slice(0, 6) : "无");
console.log("\n结果:", results.filter((r) => r.ok).length + "/" + results.length);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
