import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PROJECT = "职光简历 JobLume 求职助手";
const TPL = ["经典模板", "两栏布局", "模块标题背景色", "时间轴布局"];
const OUT = process.env.E2E_OUT ?? "/tmp/jl2";
fs.mkdirSync(OUT, { recursive: true });
const exp = [];
const step = (ok, msg) => { exp.push({ ok, msg }); console.log(`${ok ? "✅" : "❌"} ${msg}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 拦截 iframe 并把 print() 变成空操作 —— headless 下没有打印对话框
await page.addInitScript(() => {
  if (window.top !== window) return;   // 只在主文档打补丁（打印 iframe 里 body 还不存在）
  window.__printFrames = [];
  const patch = () => {
    if (!document.body || document.body.__patched) return;
    document.body.__patched = true;
    const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = orig(el);
      if (el.tagName === "IFRAME") {
        window.__printFrames.push(el);
        try { if (el.contentWindow) el.contentWindow.print = () => { window.__printCalled = true; }; } catch {}
      }
      return r;
    };
  };
  patch();
  document.addEventListener("DOMContentLoaded", patch);
});

// ── 灌档案 ──
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const now = new Date().toISOString();
await page.evaluate(({ now }) => {
  const raw = JSON.parse(localStorage.getItem("career-profile-storage"));
  const p = raw.state.profile;
  p.basic = { ...p.basic, name: "林可", title: "前端工程师", email: "linke@example.com",
              phone: "13800000000", location: "上海", employementStatus: "在职" };
  const base = { tags: [], skills: [], metrics: [], hidden: false, order: 0, createdAt: now, updatedAt: now };
  p.entities = {
    edu1: { ...base, id: "edu1", type: "education", sectionId: "education", title: "示例大学",
            subtitle: "计算机科学与技术", degree: "本科", dateRange: "2016.09 - 2020.06",
            description: "<ul><li>主修课程：数据结构、操作系统</li></ul>" },
    exp1: { ...base, id: "exp1", type: "experience", sectionId: "experience", title: "示例科技有限公司",
            subtitle: "前端工程师", dateRange: "2020.07 - 2024.03",
            description: "<ul><li>负责核心业务前端开发，页面性能提升 40%</li></ul>" },
    proj1: { ...base, id: "proj1", type: "project", sectionId: "projects", title: "职光简历 JobLume 求职助手",
             subtitle: "独立开发", dateRange: "2026.01 - 2026.09",
             description: "<ul><li>从零实现职业数据库与简历生成，覆盖 4 套模板</li><li>接入大模型做 JD 匹配，要求项召回 97.9%</li></ul>",
             link: "https://example.com/joblume", linkLabel: "项目主页" },
  };
  p.skillGroups = [{ id: "sg1", name: "前端", content: "React、TypeScript、Tailwind CSS", order: 0 }];
  p.certificateText = "大学英语六级（CET-6）";
  p.selfEvaluationContent = "<p>四年前端开发经验，关注工程质量。</p>";
  localStorage.setItem("career-profile-storage", JSON.stringify(raw));
}, { now });

// ── 生成简历 ──
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
  if (await b.count() && await b.first().isVisible().catch(() => false)) { await b.first().click(); break; }
}
await page.waitForTimeout(4000);
step(/\/app\/workbench\//.test(page.url()), "生成简历并进入工作台");

// ── 4 套模板逐一验证项目板块 ──
const preview = page.locator("#resume-preview");
const sheetTrigger = page.locator("svg.lucide-panels-left-bottom").first();
const grid = page.locator('button:has(> div.aspect-\\[210\\/297\\])');

for (let i = 0; i < TPL.length; i++) {
  await sheetTrigger.click();
  await page.waitForTimeout(900);
  const n = await grid.count();
  if (n < TPL.length) { step(false, `模板面板未展开（${n} 个模板按钮，期望 ${TPL.length}）`); break; }
  await grid.nth(i).click();
  await page.waitForTimeout(1100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  const text = await preview.innerText().catch(() => "");
  step(text.includes(PROJECT), `模板 ${i + 1}/${TPL.length} · ${TPL[i]} 渲染出项目经历`);
}
await page.screenshot({ path: `${OUT}/shot-4-after-templates.png` });

// ── 导出：抓打印 HTML ──
await page.getByRole("button", { name: "导出" }).first().click();
await page.waitForTimeout(900);
// 导出是一个模态：卡片按描述文案定位，避免撞上图标 SVG 里的 "PDF" 文本
await page.locator("div.cursor-pointer").filter({ hasText: "调用浏览器打印导出" }).first().click();
// 等到打印管线真的跑起来（字体 + 图片就绪后才调 print）
for (let i = 0; i < 40; i++) {
  const done = await page.evaluate(() => !!window.__printCalled);
  if (done) break;
  await page.waitForTimeout(500);
}
const printInfo = await page.evaluate(() => {
  const f = window.__printFrames?.[window.__printFrames.length - 1];
  if (!f) return null;
  const html = f.contentDocument?.documentElement?.outerHTML ?? "";
  return { called: !!window.__printCalled, len: html.length, html };
});
step(!!printInfo, "① 导出触发了打印管线");
step(!!printInfo?.called, "② 打印函数被调用");
step((printInfo?.len ?? 0) > 20000, `③ 打印文档已生成（${printInfo?.len ?? 0} 字符）`);
if (printInfo?.html) {
  fs.writeFileSync("/tmp/jl2/print.html", printInfo.html);
  step(printInfo.html.includes("职光简历 JobLume"), "④ 打印文档内含项目名称");
  step(/@page\s*\{[^}]*size:\s*A4/.test(printInfo.html), "⑤ 打印文档带 A4 分页规则");
}

// ── 用 Chromium 打印引擎真正出一份 PDF，再从文字层验内容 ──
if (printInfo?.html) {
  const p2 = await ctx.newPage();
  await p2.setContent(printInfo.html, { waitUntil: "load" });
  await p2.emulateMedia({ media: "print" });
  await p2.pdf({ path: `${OUT}/export.pdf`, format: "A4", printBackground: true });
  const buf = fs.readFileSync("/tmp/jl2/export.pdf");
  step(buf.length > 5000, `⑥ 产出 PDF（${(buf.length / 1024).toFixed(0)} KB，magic=${buf.subarray(0, 5).toString()}）`);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let all = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    all += c.items.map((it) => it.str).join("");
  }
  step(doc.numPages >= 1, `⑦ PDF 页数 ${doc.numPages}`);
  step(all.includes("职光简历"), "⑧ PDF 文字层含项目名称");
  // 已知缺陷：Chromium 写 ToUnicode 时，汉字与康熙部首共用字形的字符会被编成部首码位，
  // 裸文本匹配会失败。NFKC 能还原绝大多数（仅 U+2EDA ⻚ 无兼容分解）。见 docs/04 §8.2。
  const norm = all.normalize("NFKC");
  step(norm.includes("独立开发"), "⑨ PDF 文字层含项目角色（NFKC 归一化后）");
  const KANGXI = /[\u2E80-\u2FDF]/;
  const cjk = Array.from(all).filter((c) => /[\u4E00-\u9FFF\u2E80-\u2FDF]/.test(c));
  const bad = cjk.filter((c) => KANGXI.test(c));
  if (bad.length) {
    console.log(`   ℹ️  已知缺陷：文字层 ${bad.length}/${cjk.length} 个汉字是康熙部首（${(bad.length / cjk.length * 100).toFixed(1)}%）：${[...new Set(bad)].join(" ")}`);
  }
  step(all.includes("要求项召回"), "⑩ PDF 文字层含项目描述");
  step(all.includes("林可"), "⑪ PDF 文字层含姓名");
}

// ── token 健康检查 ──
// 这套配色是「别名链」：hsl(var(--background)) → var(--canvas)。链上任何一环缺失，
// background-color 会变成 unset＝透明，露出浏览器画布 —— 暗色下就是纯黑一片、
// 图标跟着看不见。这个失效模式在开发中出现过一次，所以钉成断言。
const VITALS = ["--canvas", "--ink", "--coral", "--surface-card", "--hairline", "--background", "--primary", "--border"];
for (const theme of ["light", "dark"]) {
  const p3 = await ctx.newPage();
  await p3.addInitScript((t) => localStorage.setItem("joblume-theme", t), theme);
  await p3.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
  await p3.waitForTimeout(1200);
  const v = await p3.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const n of names) out[n] = cs.getPropertyValue(n).trim();
    out._htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    out._bodyBg = getComputedStyle(document.body).backgroundColor;
    // 透明＝链断了
    out._transparent = out._bodyBg.startsWith("rgba(0, 0, 0, 0");
    // 主题有没有真的切过去。没有这条断言，storage key 一旦写错，两次都会跑浅色，
    // 上面那两条「dark 主题 token 全部解析」照样通过 —— 暗色检查变成空转。
    out._darkClass = document.documentElement.classList.contains("dark");
    return out;
  }, VITALS);
  const empty = VITALS.filter((n) => !v[n]);
  step(empty.length === 0, `${theme} 主题：${VITALS.length} 个 token 全部解析${empty.length ? `（缺 ${empty.join(",")}）` : ""}`);
  step(!v._transparent, `${theme} 主题：body 底色非透明（${v._bodyBg}）`);
  step(v._darkClass === (theme === "dark"), `${theme} 主题：html 上的 dark class 与所选主题一致`);
  await p3.close();
}

console.log("\n页面错误:", errors.length ? errors.slice(0, 10) : "无");
console.log("\n结果:", exp.filter((e) => e.ok).length + "/" + exp.length);
await browser.close();
process.exit(exp.every((e) => e.ok) ? 0 : 1);
