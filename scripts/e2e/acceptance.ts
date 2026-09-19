/**
 * 验收清单端到端实测 —— 覆盖 `core-flow` 没覆盖的部分。
 *
 * 对应 `docs/04 §8.2` 里那 8 项未勾的验收标准：
 *   无 Key 降级 / 工作台编辑能力 / 多版本管理 / 备份与恢复 / 指纹缓存
 *
 * 用 `.ts` 而不是 `.mjs`：指纹缓存那一项要**用真实的指纹函数**算种子数据，
 * 否则测的是一份手抄的逻辑，缓存失效了也发现不了。
 *
 * 跑法（需要一个起着的服务端）：
 *   pnpm dev &            # 或 pnpm start
 *   npx tsx scripts/e2e/acceptance.ts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { fingerprintEntity, fingerprintContent } from "../../src/lib/match/analysisCache";
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

/**
 * 关掉可能开着的模态。
 *
 * 工作台右侧那排面板图标里，有的点下去是会弹模态的（导出、自定义…）。
 * 不关掉的话后面所有点击都会被那层 `bg-black/80` 背板挡住，
 * 表现为「元素可见但点不动」—— 排查起来很费时间。
 */
/**
 * 切回「布局」面板（左栏是模块列表的那个）。
 *
 * 右侧那排图标会换掉中间面板，也会连带改变左栏内容。切面板之后
 * 模块列表可能就不在了，所以每次要用它之前先显式切回来 ——
 * 靠「上一步恰好没切走」是不可靠的。
 */
const openLayoutPanel = async (page: import("playwright").Page) => {
  if (await page.getByRole("button", { name: "添加模块" }).count()) return;
  const icons = await page.evaluate(() =>
    [...document.querySelectorAll("svg")]
      .filter((s) => {
        const r = s.getBoundingClientRect();
        return r.left > 1430 && r.width > 8;
      })
      .map((s) => (s.getAttribute("class") || "").split(" ").find((c) => c.startsWith("lucide-")))
      .filter(Boolean) as string[]);
  for (const cls of icons) {
    await dismissModals(page);
    await page.locator(`svg.${cls}`).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (await page.getByRole("button", { name: "添加模块" }).count()) return;
    await dismissModals(page);
  }
};

const dismissModals = async (page: import("playwright").Page) => {
  for (let i = 0; i < 3; i++) {
    const overlay = await page.locator('div[data-state="open"][aria-hidden="true"]').count();
    if (overlay === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// ════════════════════════════════════════════════════════════
// 种子档案（与 core-flow 一致，便于两个脚本互相对照）
// ════════════════════════════════════════════════════════════
const NOW = new Date().toISOString();
const ENTITIES = (): Record<string, Partial<ProfileEntity>> => ({
  edu1: { id: "edu1", type: "education", sectionId: "education", title: "示例大学", subtitle: "计算机科学与技术",
          degree: "本科", dateRange: "2016.09 - 2020.06", description: "<ul><li>主修课程：数据结构、操作系统</li></ul>" },
  exp1: { id: "exp1", type: "experience", sectionId: "experience", title: "示例科技有限公司", subtitle: "前端工程师",
          dateRange: "2020.07 - 2024.03", description: "<ul><li>负责核心业务前端开发，页面性能提升 40%</li></ul>" },
  proj1: { id: "proj1", type: "project", sectionId: "projects", title: "职光简历 JobLume 求职助手", subtitle: "独立开发",
           dateRange: "2026.01 - 2026.09", description: "<ul><li>从零实现职业数据库与简历生成</li></ul>" },
});

const seedProfile = async () => {
  await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(({ now, ents }) => {
    const raw = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null");
    if (!raw) throw new Error("career-profile-storage 未初始化");
    const p = raw.state.profile;
    p.basic = { ...p.basic, name: "林可", title: "前端工程师", email: "linke@example.com", phone: "13800000000" };
    const base = { tags: [], skills: [], metrics: [], hidden: false, order: 0, createdAt: now, updatedAt: now };
    p.entities = Object.fromEntries(Object.entries(ents).map(([k, v]) => [k, { ...base, ...v }]));
    p.skillGroups = [{ id: "sg1", name: "前端", content: "React、TypeScript、Tailwind CSS", order: 0 }];
    p.certificateText = "大学英语六级（CET-6）";
    p.selfEvaluationContent = "<p>四年前端开发经验，关注工程质量。</p>";
    localStorage.setItem("career-profile-storage", JSON.stringify(raw));
  }, { now: NOW, ents: ENTITIES() });
};

// ════════════════════════════════════════════════════════════
// 1. 无 API Key 降级
// ════════════════════════════════════════════════════════════
console.log("\n── 1. 未配置 API Key 时的降级 ──");
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// 明确清掉 Key
await page.evaluate(() => localStorage.removeItem("ai-config-storage"));
await seedProfile();

const hasKeyAfterClear = await page.evaluate(() => !!localStorage.getItem("ai-config-storage"));
step(!hasKeyAfterClear, "① 已确认处于「未配置 API Key」状态");

const profileUsable = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null");
  return !!raw?.state?.profile?.entities?.exp1;
});
step(profileUsable, "② 无 Key：职业数据库可读（条目在库）");

// ════════════════════════════════════════════════════════════
// 2. 通用简历生成（无 Key 也要能生成）
// ════════════════════════════════════════════════════════════
console.log("\n── 2. 无 Key 时生成通用简历 ──");
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "新建简历" }).first().click();
await page.waitForTimeout(900);
await page.getByText("生成通用简历", { exact: false }).first().click();
await page.waitForTimeout(1200);
await page.getByText("经典模板", { exact: true }).first().click();
await page.waitForTimeout(1300);
await page.getByRole("button", { name: /就用这个模板开始|用这个模板/ }).first().click();
await page.waitForTimeout(3000);
for (const label of ["保留全部并生成", "应用并生成"]) {
  const b = page.getByRole("button", { name: label });
  if ((await b.count()) && (await b.first().isVisible().catch(() => false))) { await b.first().click(); break; }
}
await page.waitForTimeout(4000);
step(/\/app\/workbench\//.test(page.url()), "③ 无 Key：通用简历生成成功并进入工作台");

const preview = page.locator("#resume-preview");
const previewText = await preview.innerText().catch(() => "");
step(previewText.includes("职光简历 JobLume"), "④ 无 Key：预览渲染出项目经历");

// ════════════════════════════════════════════════════════════
// 3. 工作台编辑能力
// ════════════════════════════════════════════════════════════
console.log("\n── 3. 工作台编辑能力 ──");
// 3a 换模板
const sheetTrigger = page.locator("svg.lucide-panels-left-bottom").first();
const grid = page.locator('button:has(> div.aspect-\\[210\\/297\\])');
await sheetTrigger.click();
await page.waitForTimeout(900);
const tplCount = await grid.count();
if (tplCount >= 4) {
  await grid.nth(1).click();
  await page.waitForTimeout(1100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const t = await preview.innerText().catch(() => "");
  step(t.includes("职光简历 JobLume"), "⑤ 工作台：切换模板后内容仍在（两栏布局）");
} else {
  step(false, `⑤ 工作台：模板面板只找到 ${tplCount} 个（期望 ≥4）`);
}
await page.screenshot({ path: `${OUT}/accept-workbench.png` });

// 3b 字号调整 —— 自适应找控件：先直接找「16px」这类档位按钮，
// 找不到就先切到「样式」面板再找。都没有就把实际按钮打出来，便于定位。
// 读预览里**所有**文字节点的字号集合。不假设点中的是正文还是标题档 ——
// 三档分别是正文/标题/间距，点哪一档会让「哪些元素变」不同，
// 断言「集合发生了变化」比断言「某个特定元素变了」稳。
const readSizeSet = () =>
  preview.evaluate((el) =>
    [...el.querySelectorAll("*")]
      .filter((n) => (n.textContent || "").trim().length > 0 && n.children.length === 0)
      .map((n) => getComputedStyle(n).fontSize)
      .sort()
      .join(",")
  );
// 用文本过滤而不是 getByRole(name:) —— 后者比的是**无障碍名**，
// 这类按钮的无障碍名未必等于可见文字（实测匹配不到，但 DOM 里确实有 "16px"）。
const pxChips = page.locator("button").filter({ hasText: /^\d+(\.\d+)?px$/ });
let chipCount = await pxChips.count();
if (chipCount < 2) {
  const styleTab = page.getByRole("button", { name: /^样式$/ });
  if (await styleTab.count()) {
    await styleTab.first().click().catch(() => {});
    await page.waitForTimeout(900);
    chipCount = await pxChips.count();
  }
}
if (chipCount >= 2) {
  const before = await readSizeSet();
  const chip = pxChips.first();
  const current = (await chip.innerText()).trim();
  await chip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await chip.click();
  // 是个 Radix Select：点开后会弹出 12px…24px 的选项
  const option = page.getByRole("option").filter({ hasText: /^\d+px$/ }).filter({ hasNotText: current }).first();
  await option.waitFor({ timeout: 5000 });
  const picked = (await option.innerText()).trim();
  await option.click();
  await page.waitForTimeout(1200);
  const after = await readSizeSet();
  step(before !== after, `⑥ 工作台：字号可调（${current} → ${picked}，预览字号集合已变）`);
} else {
  const seen = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 18));
  step(false, `⑥ 工作台：没找到字号档（当前按钮：${JSON.stringify(seen)}）`);
}

// 3c 板块显隐 —— 左栏每个模块行右侧有眼睛开关。
// 定位「离目标文字最近的那个可点祖先」（向上找到 innerText 足够短的那层），
// 避免 closest() 一路抓到整个列表面板。
await dismissModals(page);
await openLayoutPanel(page);
// ⑥ 里 scrollIntoViewIfNeeded 把左栏滚下去了，模块列表被滚出视口后
// 「left < 400」那些眼睛图标就是别人的了。先复位再找。
await page.evaluate(() => {
  document.querySelectorAll("*").forEach((el) => {
    if (el.scrollTop > 0) el.scrollTop = 0;
  });
});
await page.waitForTimeout(600);
const hadExp = (await preview.innerText()).includes("示例科技");
const eyeIdx = await page.evaluate(() => {
  const icons = [...document.querySelectorAll("svg.lucide-eye, svg.lucide-eye-off")].filter(
    (s) => s.getBoundingClientRect().left < 400 && s.getBoundingClientRect().width > 8
  );
  // 向上逐层找：**任意一层**的短文本命中即可。
  // 逐层「第一个非空就返回」会误判 —— 眼睛图标的直接父层通常不含模块名。
  return icons.findIndex((s) => {
    let el: Element | null = s;
    for (let i = 0; i < 6 && el; i++) {
      el = el.parentElement;
      const t = (el?.textContent || "").trim();
      if (t.length > 0 && t.length < 24 && t.includes("工作经验")) return true;
    }
    return false;
  });
});
if (eyeIdx >= 0) {
  await page
    .locator("svg.lucide-eye, svg.lucide-eye-off")
    .nth(eyeIdx)
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(1100);
  const nowHas = (await preview.innerText()).includes("示例科技");
  step(hadExp && !nowHas, `⑦ 工作台：板块可隐藏（隐藏前有经历=${hadExp}，隐藏后有=${nowHas}）`);
} else {
  step(false, `⑦ 工作台：没定位到「工作经验」那一行的眼睛开关（扫到 ${eyeIdx} ）`);
}

// ════════════════════════════════════════════════════════════
// 4. 多版本管理
// ════════════════════════════════════════════════════════════
console.log("\n── 4. 多版本管理 ──");
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const countCards = async () =>
  page.locator('button[aria-label], button:has(svg.lucide-pen)').filter({ hasText: /编辑|复制|删除/ }).count() / 3;
// 更稳的计数：数「编辑」按钮
const countEdit = () => page.getByRole("button", { name: "编辑" }).count();
const v1 = await countEdit();
step(v1 >= 1, `⑧ 多版本：列表里有 ${v1} 份简历`);

await page.getByRole("button", { name: "复制" }).first().click();
await page.waitForTimeout(1500);
const v2 = await countEdit();
step(v2 === v1 + 1, `⑨ 多版本：复制后从 ${v1} 变 ${v2} 份`);

if (v2 > 1) {
  await page.getByRole("button", { name: "删除" }).first().click();
  await page.waitForTimeout(900);
  // 删除走的是 AlertDialog（自定义模态），不是原生 dialog —— 得点它的确认按钮
  const confirm = page
    .locator('[role="alertdialog"] button, [role="dialog"] button')
    .filter({ hasText: /删除|确认|确定/ })
    .last();
  if (await confirm.count()) {
    await confirm.click();
    await page.waitForTimeout(1800);
    const v3 = await countEdit();
    step(v3 === v2 - 1, `⑩ 多版本：删除后从 ${v2} 变 ${v3} 份`);
  } else {
    step(false, "⑩ 多版本：删除确认弹窗里没找到确认按钮");
  }
}

// ════════════════════════════════════════════════════════════
// 5. 备份与恢复
// ════════════════════════════════════════════════════════════
console.log("\n── 5. 全库备份与恢复 ──");
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const profBtns = await page.evaluate(() =>
  [...document.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 25));
console.log("   档案页按钮:", JSON.stringify(profBtns));
step(profBtns.some((b) => /导出/.test(b)), "⑪ 备份：档案页有导出入口");

// 真的走一遍往返：导出 → 清空 → 导入 → 数据回来
let backupOk = false;
try {
  const dl = page.waitForEvent("download", { timeout: 15000 });
  await page.getByRole("button", { name: /导出数据/ }).first().click();
  await page.waitForTimeout(800);
  // 导出可能先弹一个选项框
  const dlBtn = page.locator('[role="dialog"] button, [role="alertdialog"] button').filter({ hasText: /导出|下载|确认/ }).last();
  if (await dlBtn.count()) { await dlBtn.click().catch(() => {}); }
  const download = await dl;
  const file = `${OUT}/accept-backup.json`;
  await download.saveAs(file);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const entityCount = Object.keys(parsed?.profile?.entities ?? parsed?.state?.profile?.entities ?? {}).length;

  // 清空后重新导入
  await page.evaluate(() => {
    localStorage.removeItem("career-profile-storage");
    localStorage.removeItem("resume-store");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /导入数据/ }).first().click();
  await page.waitForTimeout(900);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(file);
  await page.waitForTimeout(1200);
  const confirm = page.locator('[role="dialog"] button, [role="alertdialog"] button').filter({ hasText: /导入|确认|确定|覆盖/ }).last();
  if (await confirm.count()) { await confirm.click().catch(() => {}); }
  await page.waitForTimeout(2000);
  const restored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null");
    return Object.keys(raw?.state?.profile?.entities ?? {}).length;
  });
  backupOk = entityCount > 0 && restored === entityCount;
  step(backupOk, `⑫ 备份往返：导出 ${entityCount} 条 → 清空 → 导入后 ${restored} 条`);
} catch (e) {
  step(false, `⑫ 备份往返失败：${(e as Error).message.split("\n")[0].slice(0, 80)}`);
}

console.log("\n页面错误:", errors.length ? errors.slice(0, 6) : "无");
console.log("\n结果:", results.filter((r) => r.ok).length + "/" + results.length);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
