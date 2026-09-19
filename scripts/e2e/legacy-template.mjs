import { chromium } from "playwright";
import { ensureCurrentUser } from "./userScope.mjs";
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
await ensureCurrentUser(page);
await page.waitForTimeout(1200);
const now = new Date().toISOString();
await page.evaluate(({ now }) => {
  const raw = JSON.parse(localStorage.getItem("career-profile-storage"));
  const p = raw.state.profiles[raw.state.currentUserId];
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
// 通用简历也要过「内容选择」步：默认全不勾，用「全选」起步再生成
await page.getByRole("button", { name: "全选" }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "开始生成" }).click();
await page.waitForTimeout(4000);
step(/\/app\/workbench\//.test(page.url()), "生成简历并进入工作台");


// ── 老数据兼容：把 templateId 改成已删的模板，看还能不能渲染 ──
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const seeded = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("resume-storage") || "null");
  if (!raw) return { ok: false, reason: "resume-storage 不存在" };
  const first = Object.values(raw.state.resumes ?? {})[0];
  if (!first) return { ok: false, reason: "还没有简历" };
  const before = first.templateId;
  first.templateId = "swiss";          // 本次精简删掉的模板
  localStorage.setItem("resume-storage", JSON.stringify(raw));
  return { ok: true, id: first.id, before };
});
step(seeded.ok, `① 把简历的 templateId 从 ${seeded.before} 改成已删的 swiss`);
if (seeded.ok) {
  const p2 = await ctx.newPage();
  const errs2 = [];
  p2.on("pageerror", (e) => errs2.push(e.message));
  p2.on("console", (m) => { if (m.type() === "error") errs2.push(m.text()); });
  await p2.goto(`${BASE}/app/workbench/${seeded.id}`, { waitUntil: "networkidle" });
  await p2.waitForTimeout(3000);
  const prev = await p2.locator("#resume-preview").innerText().catch(() => "");
  const body = await p2.locator("body").innerText().catch(() => "");
  step(prev.length > 50, `② 简历照常渲染（预览 ${prev.length} 字符，回退到经典模板）`);
  step(prev.includes("职光简历 JobLume"), "③ 项目经历仍在");
  step(errs2.length === 0, `④ 页面错误 ${errs2.length}`);
  if (errs2.length) console.log("   ", errs2.slice(0, 5));
  step(!/出了点问题|出错了|Something went wrong/i.test(body), "⑤ 没有落到错误页");
  await p2.screenshot({ path: `${OUT}/shot-8-stale-template.png` });
}
console.log("\n结果:", exp.filter((e) => e.ok).length + "/" + exp.length);
await browser.close();
process.exit(exp.every((e) => e.ok) ? 0 : 1);
