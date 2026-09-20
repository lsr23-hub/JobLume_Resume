/**
 * i18n 修复的界面验证 —— 断言那 4 处原先「显示成原始 key」的地方现在显示真实文案。
 *
 * 为什么要有这个脚本：`scripts/audit/i18n-scan.mjs` 只能证明**字典里有 key**，
 * 证明不了**界面上真的是那句话**。字典补了但代码请求的路径仍不对（或相反）时，
 * 扫描器会绿、界面照样坏。这个脚本走真实渲染路径。
 *
 * 用法：先起 dev server（端口默认 3000，与其它 e2e 脚本一致），再
 *   pnpm audit:i18n-ui
 * 端口不同时：`E2E_BASE=http://localhost:3001 pnpm audit:i18n-ui`
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { ensureCurrentUser, seedSaves } from "../e2e/userScope.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const now = new Date().toISOString();

let pass = 0, fail = 0;
const step = (ok, msg, detail) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
  if (!ok && detail !== undefined) console.log(`     实际: ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

// ── 种子：一份只有「语言能力 / 证书奖项」而没有条目的档案 ──
// 这个形状是刻意的：它同时压中两个修复点 ——
//  · 语言能力那一行（依赖 languageLabel）
//  · 「库是否为空」的判定（这份档案在 hasContent 眼里是空的，在 hasUsableProfile 眼里不是）
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await ensureCurrentUser(page);
await page.waitForTimeout(1000);
await page.evaluate(({ now }) => {
  const raw = JSON.parse(localStorage.getItem("career-profile-storage"));
  const p = raw.state.profiles[raw.state.currentUserId];
  p.basic = { ...p.basic, name: "林可", title: "前端工程师", email: "linke@example.com" };
  p.entities = {};                       // 刻意留空 → 触发空列表
  p.skillGroups = [
    { id: "g1", name: "前端框架", content: "React、Vue.js", order: 0 },
  ];
  p.certificateText = "软件设计师";
  p.languageText = "英语 CET-6";
  p.meta = { ...p.meta, updatedAt: now };
  localStorage.setItem("career-profile-storage", JSON.stringify(raw));
}, { now });
await seedSaves(page);

// ════════════════════════════════════════════
// ① 空列表提示（原显示 "empty"）
// ════════════════════════════════════════════
console.log("\n── ① 条目的空列表提示 ──");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /教育经历/ }).first().click();
await page.waitForTimeout(700);
let body = await page.locator("main").innerText();
step(!body.includes("\nempty\n") && !/(^|\n)empty($|\n)/.test(body),
     "空列表不再显示原始 key「empty」", body.slice(0, 200));
step(body.includes("这里还没有内容"), "显示的是文案「这里还没有内容。点下方「添加条目」录入第一条。」");

// ════════════════════════════════════════════
// ② 类别输入框的 placeholder（原显示 "hints.categoryPlaceholder"）
// ════════════════════════════════════════════
console.log("\n── ② 类别输入框 placeholder ──");
await page.getByRole("button", { name: /添加条目/ }).first().click();
// 「匹配提示」是可折叠区，实体卡片展开后富文本编辑器还要初始化一会儿。
// 这里**等目标出现**而不是 sleep 固定时长 —— 固定时长在不同机器上会闪断，
// 而断言写成 count()>0 时闪断会伪装成真实失败，浪费排查时间。
const catInput = page.locator('input[placeholder*="金融"]');
await catInput.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
const ph = await catInput.count();
step(ph > 0, "类别 placeholder 是「如：金融、计算机、运营 —— 回车确认」");
const badPh = await page.locator('input[placeholder*="categoryPlaceholder"]').count();
step(badPh === 0, "placeholder 里不再出现原始 key");

// ── ②' 专业技能面板的两行固定标签 ──
// 这四条断言是为了钉住一个我**在恢复时差点改坏**的地方：
// `profile.skills.languageLabel`（面板要的）与 `profile.languageLabel`（生成简历要的）
// 是两个不同的键，改一个不能碰另一个。
console.log("\n── ②' 专业技能面板的固定行标签 ──");
await page.getByRole("button", { name: /专业技能/ }).first().click();
await page.waitForTimeout(800);
const skillsText = await page.locator("main").innerText();
step(skillsText.includes("证书奖项"), "面板显示「证书奖项」标签");
step(skillsText.includes("语言能力"), "面板显示「语言能力」标签");
step(!/skills\.[a-zA-Z]+Label/.test(skillsText), "面板里没有裸露的 i18n key", skillsText.slice(0, 200));
step(!/\bhints\.categoryPlaceholder\b/.test(skillsText), "面板里没有裸露的 categoryPlaceholder");

// ════════════════════════════════════════════
// ③ 导入弹窗副标题（原显示 "dashboard.resumes.importDialog.description"）
// ════════════════════════════════════════════
console.log("\n── ③ 导入简历弹窗副标题 ──");
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /导入简历/ }).first().click();
await page.waitForTimeout(900);
const dialogText = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
step(!dialogText.includes("importDialog"), "副标题不再显示原始 key");
step(dialogText.includes("从文件导入已导出的简历配置"), "显示的是文案「从文件导入已导出的简历配置。」", dialogText.slice(0, 160));
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// ════════════════════════════════════════════
// ④ 生成简历里的「语言能力」行（原整行消失）
//    这条最关键：languageLabel 取不到时，materialize 的 `if (languages.length > 0 && languageLabel)`
//    为假，语言能力**静默不出现在生成的简历里**。
// ════════════════════════════════════════════
console.log("\n── ④ 生成简历里的「语言能力」 ──");
await page.getByRole("button", { name: "新建简历" }).first().click();
await page.waitForTimeout(900);
await page.getByText("生成通用简历", { exact: false }).first().click();
await page.waitForTimeout(1000);
await page.getByText("经典模板", { exact: true }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /就用这个模板开始|用这个模板/ }).first().click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "全选" }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "开始生成" }).click();
await page.waitForTimeout(4500);

step(/\/app\/workbench\//.test(page.url()), "已进入工作台");
const preview = await page.locator("#resume-preview").innerText().catch(() => "");
step(preview.includes("语言能力"), "预览里出现「语言能力」标签", preview.slice(0, 300));
step(preview.includes("英语 CET-6"), "预览里出现语言内容「英语 CET-6」");
step(preview.includes("证书奖项"), "预览里出现「证书奖项」标签（对照组，这一条改前就是好的）");

// ════════════════════════════════════════════
// ⑤ 导出物里不含 GitHub token（批次 2）
//    前面验的是界面文案，这一条验的是**落盘内容** ——
//    单元测试只能证明 stripResumeCredentials 本身对，
//    证明不了导出链路真的调了它。这里抓真实下载再解析。
// ════════════════════════════════════════════
console.log("\n── ⑤ 导出物不含 GitHub token ──");
const FAKE_TOKEN = "ghp_MUST_NOT_LEAK_1234567890";

// 第 ④ 步刚生成完简历，工作台 URL 里就是它的 id —— 直接拿来用，
// 不去猜 store 的形状（`byUser` / `activeByUser` 的写法在别处也可能变）
const fromUrl = page.url().match(/\/app\/workbench\/([^/?#]+)/);
const resumeId = fromUrl ? fromUrl[1] : null;
step(Boolean(resumeId), "前置：从工作台 URL 拿到了简历 id", page.url());

const ids = await page.evaluate((rid) => {
  const r = JSON.parse(localStorage.getItem("resume-storage")).state;
  const p = JSON.parse(localStorage.getItem("career-profile-storage")).state;
  const uid = Object.keys(r.byUser).find((u) => Object.prototype.hasOwnProperty.call(r.byUser[u], rid))
    ?? p.currentUserId;
  return { uid, resumeId: rid };
}, resumeId);
step(Boolean(ids.uid), "前置：找得到这份简历属于哪个用户", ids);

await page.evaluate(({ uid, resumeId: rid, token }) => {
  const raw = JSON.parse(localStorage.getItem("resume-storage"));
  raw.state.byUser[uid][rid].basic = {
    ...raw.state.byUser[uid][rid].basic,
    githubKey: token,
    githubUseName: "octocat",
  };
  localStorage.setItem("resume-storage", JSON.stringify(raw));
}, { uid: ids.uid, resumeId: ids.resumeId, token: FAKE_TOKEN });

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);

const seeded = await page.evaluate(({ uid, resumeId: rid }) => {
  const raw = JSON.parse(localStorage.getItem("resume-storage"));
  return raw.state.byUser[uid][rid].basic.githubKey;
}, ids);
step(seeded === FAKE_TOKEN, "前置：简历里确实存了 token（否则测的是空气）", seeded);

const dlJson = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
await page.getByRole("button", { name: /^导出$/ }).first().click();
await page.waitForTimeout(1800);
// 卡片本身是个 div（onClick 挂在 div 上，不是 button），
// 直接点文字会被它的父级 div 拦截 —— 点那个可点的父级
const jsonCard = page.locator('div.cursor-pointer').filter({ hasText: "JSON配置" }).first();
await jsonCard.waitFor({ state: "visible", timeout: 10000 });

// 摘凭据是静默的，界面上必须有一句说明，否则用户会以为贡献图坏了。
// ⚠️ 必须在**点卡片之前**读 —— 导出成功会关掉弹窗。
const dlgText = await page.locator('[role="dialog"]').first().innerText().catch(() => "");
step(dlgText.includes("不包含 GitHub Access Token"), "导出弹窗说明了「不含凭据」");
step(!dlgText.includes("credentialNotice"), "该说明不是裸露的 i18n key");

await jsonCard.click();
const jsonDl = await dlJson;
step(jsonDl !== null, "点「JSON配置」触发了下载");
await jsonDl.saveAs("/tmp/jl-audit-export.json");
const exported = JSON.parse(fs.readFileSync("/tmp/jl-audit-export.json", "utf8"));
step(exported.basic?.githubKey === "", "简历 JSON 导出里 githubKey 被清空", exported.basic?.githubKey);
step(!JSON.stringify(exported).includes(FAKE_TOKEN), "整个导出文件里搜不到 token 明文");
step(exported.basic?.githubUseName === "octocat", "同组件的 githubUseName 保留（没摘过头）", exported.basic?.githubUseName);

await page.goto(`${BASE}/app/dashboard/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const dlBak = page.waitForEvent("download", { timeout: 20000 });
await page.getByRole("button", { name: /导出全库备份/ }).first().click();
const bakDl = await dlBak;
await bakDl.saveAs("/tmp/jl-audit-backup.zip");
// 备份是 zip（S6）：数据在 backup.json 里，图片原始字节在 images/ 里
const backupZip = unzipSync(new Uint8Array(fs.readFileSync("/tmp/jl-audit-backup.zip")));
const backup = JSON.parse(strFromU8(backupZip["backup.json"]));
step(!JSON.stringify(backup).includes(FAKE_TOKEN), "全库备份文件里也搜不到 token 明文");
step(backup.resumes?.[0]?.basic?.githubUseName === "octocat", "备份里简历的其它字段仍在");

await page.waitForTimeout(2500);
const mirrorDir = `${process.cwd()}/saves/${ids.uid}/resumes`;
const mirrored = fs.existsSync(mirrorDir)
  ? fs.readdirSync(mirrorDir).map((f) => fs.readFileSync(`${mirrorDir}/${f}`, "utf8")).join("")
  : "";
step(mirrored.includes(FAKE_TOKEN), "存档镜像里 token 仍在（摘过头会让贡献日历失效）");

console.log("\n页面错误:", errors.length ? errors : "无");
console.log(`\n结果: ${pass}/${pass + fail}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
