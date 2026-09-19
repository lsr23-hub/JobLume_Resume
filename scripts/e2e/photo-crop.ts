/**
 * 照片链路 + 专业技能分组 —— 覆盖这一轮的四项改动。
 *
 *   1. 简历编辑器「照片」复用职业数据库的裁剪器（上传即裁剪）
 *   2. 裁剪滑块可拖、可点 ±（命中带从 8px 撑到 24px）
 *   3. 专业技能里「证书奖项 / 语言能力」改成与技能分组同形的行
 *   4. 板块标题「荣誉课程」→「获奖情况」
 *
 * 跑法（需要一个起着的服务端）：
 *   pnpm dev &            # 或 pnpm start
 *   pnpm e2e:photo
 */
import { chromium, type Page } from "playwright";
import { ensureCurrentUser } from "./userScope.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";

const results: Array<{ ok: boolean; msg: string }> = [];
const step = (ok: boolean, msg: string) => {
  results.push({ ok, msg });
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

/** 90×120 纯色 PNG。裁剪器只要求一张真图，纯色 deflate 后只有 301 字节 */
const FIXTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAFoAAAB4CAIAAAD9rnJoAAAApklEQVR42u3QQQ0AAAgEoItoHCMay58lZCMBmS5OFOjQoUOHDh06dOjQoUOHDh06dOjQoQMdOnTo0KFDhw4dOnTo0KFDhw4dOnToQIcOHTp06NChQ4cOHTp06NChQ4cOHTrQoUOHDh06dOjQoUOHDh06dOjQoUOHDnTo0KFDhw4dOnTo0KFDhw4dOnTo0KEDHTp06NChQ4cOHTp06NChQ4cOHTp0fLfTXe7QYkkT0wAAAABJRU5ErkJggg==",
  "base64"
);
const PHOTO = { name: "photo.png", mimeType: "image/png", buffer: FIXTURE };

/** 裁剪器弹窗：抽屉也是 role=dialog，必须靠内容区分 */
const cropper = (page: Page) =>
  page.locator('[role="dialog"]').filter({ hasText: "裁剪照片" }).last();

const zoomOf = (page: Page) =>
  cropper(page).locator('[role="slider"]').getAttribute("aria-valuenow");

const storedResume = (page: Page, pick: (r: any) => unknown) =>
  page.evaluate((src) => {
    const raw = JSON.parse(localStorage.getItem("resume-storage") ?? "null");
    const st = raw?.state ?? {};
    // 简历按用户分桶（见 store/userScope）：取当前用户那一桶。
    // 注意 currentUserId 存在 career-profile-storage 里，不在 resume-storage。
    const uid = JSON.parse(
      localStorage.getItem("career-profile-storage") ?? "null"
    )?.state?.currentUserId as string | undefined;
    const bucket = (st.byUser?.[uid ?? ""] ?? {}) as Record<string, unknown>;
    const r = bucket[st.activeByUser?.[uid ?? ""]] ?? Object.values(bucket)[0];
    // eslint-disable-next-line no-new-func
    return r ? new Function("r", `return (${src})(r)`)!(r) : null;
  }, pick.toString());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// ─────────── 职业数据库 ───────────
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await ensureCurrentUser(page);
await page.waitForTimeout(1500);
// 种一条经历：编辑器那条路要能「全选」，没有条目「开始生成」是禁用的
await page.evaluate(() => {
  const NOW = new Date().toISOString();
  const raw = JSON.parse(localStorage.getItem("career-profile-storage")!);
  raw.state.profiles[raw.state.currentUserId].entities = {
    exp1: {
      id: "exp1", type: "experience", sectionId: "experience",
      title: "示例科技", subtitle: "前端工程师", dateRange: "2020.07 - 2024.03",
      description: "<ul><li>负责核心业务前端开发</li></ul>",
      tags: [], skills: [], metrics: [], hidden: false, order: 0,
      createdAt: NOW, updatedAt: NOW,
    },
  };
  localStorage.setItem("career-profile-storage", JSON.stringify(raw));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);

step(await page.getByRole("button", { name: /获奖情况/ }).count() > 0, "板块导航显示「获奖情况」");
step(await page.getByRole("button", { name: /荣誉课程/ }).count() === 0, "板块导航不再出现「荣誉课程」");

await page.getByRole("button", { name: /专业技能/ }).click();
await page.waitForTimeout(500);
const certRow = page.locator("div.flex.items-center.gap-2.rounded-xl").filter({ hasText: "证书奖项" }).first();
const langRow = page.locator("div.flex.items-center.gap-2.rounded-xl").filter({ hasText: "语言能力" }).first();
step((await certRow.count()) > 0 && (await langRow.count()) > 0, "「证书奖项 / 语言能力」各渲染成一行");
step((await certRow.locator("textarea").count()) === 0, "证书不再是多行文本框（与技能分组同形）");

await page.getByPlaceholder(/新分组名称/).fill("编程语言");
await page.getByRole("button", { name: /添加分组/ }).click();
await page.waitForTimeout(700);
const groupName = page.locator('input[value="编程语言"]').first();
const gb = await groupName.boundingBox();
const cb = await certRow.locator("span").nth(1).boundingBox();
step(!!gb && !!cb && Math.abs(gb.x - cb.x) < 2, `证书行与分组行的名称列对齐（x=${gb?.x} / ${cb?.x}）`);

// ─────────── 裁剪器 ───────────
await page.getByRole("button", { name: /基本信息/ }).click();
await page.waitForTimeout(400);
await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(PHOTO);
await page.waitForTimeout(1200);

step((await cropper(page).innerText()).includes("取消"), "裁剪器有可读的取消按钮（此前是裸 key `cancel`）");

const plus = cropper(page).getByRole("button", { name: "放大" });
const minus = cropper(page).getByRole("button", { name: "缩小" });
const z0 = await zoomOf(page);
await plus.click();
await plus.click();
await page.waitForTimeout(250);
const z1 = await zoomOf(page);
step(Number(z1) > Number(z0), `「+」可点（${z0} → ${z1}）`);
await minus.click();
await page.waitForTimeout(250);
step(Number(await zoomOf(page)) < Number(z1), `「−」可点（${z1} → ${await zoomOf(page)}）`);

const root = cropper(page).locator("span.touch-none").last();
const rb = (await root.boundingBox())!;
step(rb.height >= 20, `滑块命中带高度 ${Math.round(rb.height)}px（修前 8px，只有 track 那么高）`);

// 从命中带的上边缘按下再拖：修前这里整段落空，用户只会在 track 上「点」出跳变
const cy = rb.y + 2;
const x0 = rb.x + 20;
await page.mouse.move(x0, cy);
await page.mouse.down();
const samples: string[] = [];
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(x0 + i * 14, cy);
  await page.waitForTimeout(30);
  samples.push((await zoomOf(page))!);
}
await page.mouse.up();
step(new Set(samples).size > 1, `命中带边缘按下也能拖动（${samples[0]} → ${samples.at(-1)}）`);

await cropper(page).getByRole("button", { name: "确认裁剪" }).click();
await page.waitForTimeout(1200);
const profilePhoto = await page.evaluate(() =>
  (() => {
    const st = JSON.parse(localStorage.getItem("career-profile-storage")!).state;
    return (st.profiles[st.currentUserId].basic.photo ?? "").slice(0, 8);
  })()
);
step(profilePhoto === "idb:img_", `裁剪结果写进档案（${profilePhoto}…，档案层走 IndexedDB 引用）`);

// ─────────── 简历编辑器 ───────────
await page.goto(`${BASE}/app/dashboard/resumes`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
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
step(/\/app\/workbench\//.test(page.url()), "进入简历编辑器");

await page.locator("svg.lucide-settings2").first().click();
await page.waitForTimeout(900);
const drawer = page.locator('[role="dialog"]').filter({ hasText: "照片设置" }).first();
const drawerText = await drawer.innerText();
step(drawerText.includes("尺寸"), "照片抽屉有「尺寸」");
step(/小[\s\S]*中[\s\S]*大/.test(drawerText), "尺寸是三档 小 / 中 / 大");
step(!drawerText.includes("宽高比"), "「宽高比」整块已移除（裁剪已固定 3:4，留着只会自相矛盾）");

await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(PHOTO);
await page.waitForTimeout(1200);
step((await cropper(page).innerText()).includes("裁剪照片"), "编辑器里上传后弹出裁剪器");
step((await drawer.innerText()).includes("照片设置"), "裁剪器打开时抽屉仍在");

// 在裁剪器里点一下：抽屉有「点外面就关」的逻辑，裁剪器 portal 到 body，天然在抽屉之外
await cropper(page).locator("p").first().click();
await page.waitForTimeout(400);
step((await drawer.innerText()).includes("照片设置"), "在裁剪器里点击不会误关抽屉");

await cropper(page).getByRole("button", { name: "确认裁剪" }).click();
await page.waitForTimeout(1500);
const photo = await storedResume(page, (r: any) => (r.basic?.photo ?? "").slice(0, 15));
step(typeof photo === "string" && photo.startsWith("data:image/jpeg"), `裁剪结果写进简历（${photo}…）`);
step((await page.locator("img[alt='Profile']").count()) > 0, "抽屉里出现裁剪后的预览");

await drawer.getByRole("button", { name: "大", exact: true }).click();
await page.waitForTimeout(900);
const w = await storedResume(page, (r: any) => r.basic?.photoConfig?.width);
step(w === 120, `「大」把照片宽度设为 120（当前 ${w}）`);
await drawer.getByRole("button", { name: "小", exact: true }).click();
await page.waitForTimeout(700);
step((await storedResume(page, (r: any) => r.basic?.photoConfig?.width)) === 72, "「小」把照片宽度设为 72");

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n页面错误: ${pageErrors.length ? pageErrors.join(" | ") : "无"}`);
console.log(`结果: ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
