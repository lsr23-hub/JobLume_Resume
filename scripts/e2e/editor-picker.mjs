import { chromium } from "playwright";
import { ensureCurrentUser, seedSaves } from "./userScope.mjs";
import fs from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const PROJECT = "职光简历 JobLume 求职助手";
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
await seedSaves(page);
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


// ── 编辑器「从数据库挑选」：先删掉，再从数据库加回来 ──
const preview = page.locator("#resume-preview");
step((await preview.innerText()).includes(PROJECT), "① 起点：简历里有项目经历");

// 左侧板块列表是 div（getByRole 命中的是 0 尺寸重影），按可见元素坐标点
const box = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("div,li,a"))
    .filter((el) => (el.textContent || "").trim() === "🚀项目经历" || (el.textContent || "").trim() === "项目经历");
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 40 && r.height > 20) return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  }
  return null;
});
step(!!box, "①b 找到左侧「项目经历」板块入口");
await page.mouse.click(box.x, box.y);
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/shot-5-project-panel.png` });

// 中间面板里这条项目的删除按钮（左侧栏每行也有 trash，不能取 .first()）
await page.screenshot({ path: `${OUT}/shot-5b-panel.png` });
const trashes = await page.evaluate(() =>
  Array.from(document.querySelectorAll("svg.lucide-trash2")).map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width) };
  }).filter((t) => t.w > 0)
);
console.log("可见 trash 图标:", JSON.stringify(trashes));
const target = trashes.find((t) => t.x > 300 && t.x < 760);
step(!!target, "①c 找到中间面板里的删除按钮");
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(800);
for (const label of ["删除", "确认", "确定"]) {
  const b = page.getByRole("button", { name: label });
  if (await b.count() && await b.first().isVisible().catch(() => false)) { await b.first().click(); break; }
}
await page.waitForTimeout(1200);
step(!(await preview.innerText()).includes(PROJECT), "② 删除后简历里不再有这条项目");

// 从数据库加回来
await page.getByRole("button", { name: /^添加项目$/ }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/shot-6-picker.png` });
const dlg = page.getByText("从职业数据库选择要放进这份简历的条目", { exact: false });
step(await dlg.count() > 0, "③ 弹出「从职业数据库挑选」对话框");
const row = page.getByText(PROJECT, { exact: false }).last();
await row.click();
await page.waitForTimeout(600);
const confirm = page.getByRole("button", { name: /加入所选/ });
step(await confirm.count() > 0, "④ 出现「加入所选」按钮");
if (await confirm.count()) await confirm.first().click();
await page.waitForTimeout(1800);
const back = await preview.innerText();
step(back.includes(PROJECT), "⑤ 项目经历已从数据库加入简历");
step(back.includes("独立开发"), "⑥ 角色字段一并带入");
await page.screenshot({ path: `${OUT}/shot-7-readded.png` });

console.log("\n页面错误:", errors.length ? errors.slice(0, 10) : "无");
console.log("\n结果:", exp.filter((e) => e.ok).length + "/" + exp.length);
await browser.close();
process.exit(exp.every((e) => e.ok) ? 0 : 1);
