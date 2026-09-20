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
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { ensureCurrentUser, seedSaves } from "./userScope.mjs";

/**
 * 数据里的照片是不是一个**引用**（`img_<uuid>.<ext>`）。
 *
 * S5 之后二进制落盘、数据里只留引用 —— 所以要钉的性质是「**不是内联 base64**」，
 * 而不是某个具体前缀（前缀随设计变过一次：`idb:img_x` → `img_x.jpg`）。
 */
const isStoredRef = (value: unknown): boolean =>
  typeof value === "string" && /^img_.+\.(jpg|png|webp|gif|avif)$/.test(value);

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
const profilePhoto = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("career-profile-storage")!).state;
  return st.profiles[st.currentUserId].basic.photo ?? "";
});
step(isStoredRef(profilePhoto), `裁剪结果写进档案，且是**引用**而非内联 base64（${profilePhoto}）`);

// S5 的核心：二进制真的落到了盘上
const photoUid = await page.evaluate(
  () => JSON.parse(localStorage.getItem("career-profile-storage")!).state.currentUserId
);
const imageFiles = await fs
  .readdir(path.join(process.cwd(), "saves", photoUid, "images"))
  .catch(() => [] as string[]);
step(
  imageFiles.includes(profilePhoto),
  `**字节落到了盘上**（saves/<uid>/images/ 有 ${imageFiles.length} 个文件，含「${profilePhoto}」）`
);
step(
  await fs
    .stat(path.join(process.cwd(), "saves", photoUid, "images", profilePhoto))
    .then((s) => s.size > 0)
    .catch(() => false),
  "而且那个文件不是空的"
);

// ─────────── 简历编辑器 ───────────
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
const photo = await storedResume(page, (r: any) => r.basic?.photo ?? "");
step(isStoredRef(photo), `裁剪结果写进简历，且是**引用**而非内联 base64（${photo}）`);
step((await page.locator("img[alt='Profile']").count()) > 0, "抽屉里出现裁剪后的预览");

await drawer.getByRole("button", { name: "大", exact: true }).click();
await page.waitForTimeout(900);
const w = await storedResume(page, (r: any) => r.basic?.photoConfig?.width);
step(w === 120, `「大」把照片宽度设为 120（当前 ${w}）`);
await drawer.getByRole("button", { name: "小", exact: true }).click();
await page.waitForTimeout(700);
step((await storedResume(page, (r: any) => r.basic?.photoConfig?.width)) === 72, "「小」把照片宽度设为 72");

// ─────────── 孤儿图片回收 ───────────
//
// 换一张照片之后旧的那张就没人引用了。**保存成功时**服务端扫一遍引用、把孤儿的清掉
// （`pruneOrphanImages`）。这里钉的是"路由真的接上了那一刀"——逻辑本身有单测。
//
// 先把旧文件的修改时间推早两小时，绕过"刚写进来的不动"那个宽限期：图片是选中即上传的，
// 字节先落盘、引用要等保存才写进 json，所以刚上传的必须先保护起来。
console.log("\n── 孤儿图片回收 ──");
// 前一节在编辑器里，这里要回档案页换档案照片
await page.goto(`${BASE}/app/dashboard/profile`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const imagesDir = path.join(process.cwd(), "saves", photoUid, "images");
const oldPhoto = profilePhoto;
const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
await fs.utimes(path.join(imagesDir, oldPhoto), past, past);

await page.getByRole("button", { name: /基本信息/ }).click();
await page.waitForTimeout(400);
await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(PHOTO);
await page.waitForTimeout(1200);
await cropper(page).getByRole("button", { name: "确认裁剪" }).click();
await page.waitForTimeout(1200);
// 触发一次保存 —— 回收挂在"保存成功之后"
const gcBadge = page.getByRole("button", { name: /未保存|写入磁盘失败/ }).first();
if ((await gcBadge.count()) > 0) {
  await gcBadge.click();
  await page.waitForTimeout(1800);
}

const after = await fs.readdir(imagesDir).catch(() => [] as string[]);
step(!after.includes(oldPhoto), `换过照片之后，旧的那张被回收了（${oldPhoto}）`);
step(
  after.length >= 1 && after.every((n) => /^img_.+\.(jpg|png|webp|gif|avif)$/.test(n)),
  `留下来的都是合法图片（${after.join(", ")}）`
);

// ─────────── 缓存被清掉后，照片要从磁盘拉回来 ───────────
//
// S5 之后二进制在磁盘上、IndexedDB 只是**缓存**。把缓存清空再打开，照片必须还能显示 ——
// 这就是"换台机器也看得到"的同一件事（那边连 localStorage 都是空的，多一层采纳用户的
// 流程）。断言用 `naturalWidth > 0`：那才证明字节真的到了、解码出来了。
console.log("\n── 缓存清空后从磁盘拉回 ──");
await page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("JobLumeImageDB", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("images", "readwrite");
    const request = tx.objectStore("images").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const restoredWidth = await page.evaluate(() => {
  const img = Array.from(document.querySelectorAll("img")).find((i) => i.src.startsWith("blob:"));
  return img ? img.naturalWidth : 0;
});
step(restoredWidth > 0, `缓存清空后照片仍显示（${restoredWidth}px 宽）—— 字节是从磁盘拉回来的`);

// ─────────── 全库备份要把图片字节一起装走 ───────────
//
// 这是缺口 2 的全部意义：内联 base64 会撑爆 localStorage 配额，而"不装图"则让备份
// 不完整（换台机器照片就没了）。所以备份是 zip：`manifest.json` + `backup.json` + `images/`。
console.log("\n── 备份里的图片 ──");
await page.goto(`${BASE}/app/dashboard/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const backupDl = page.waitForEvent("download", { timeout: 20000 });
await page.getByRole("button", { name: /导出全库备份/ }).first().click();
const backupDownload = await backupDl;
const backupPath = path.join(os.tmpdir(), "photo-crop-backup.zip");
await backupDownload.saveAs(backupPath);

const zipFiles = unzipSync(new Uint8Array(await fs.readFile(backupPath)));
const zipNames = Object.keys(zipFiles).sort();
step(
  zipNames.includes("manifest.json") && zipNames.includes("backup.json"),
  `备份是 zip，含清单与数据（${zipNames.filter((n) => !n.startsWith("images/")).join(", ")}）`
);
const insideImages = zipNames.filter((n) => n.startsWith("images/"));
step(insideImages.length >= 1, `**照片的字节装进了备份**（${insideImages.join(", ")}）`);
const manifest = JSON.parse(strFromU8(zipFiles["manifest.json"]));
step(
  manifest.counts?.images === insideImages.length,
  `清单说的张数与实际一致（${manifest.counts?.images} 张）`
);
await fs.rm(backupPath, { force: true });

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n页面错误: ${pageErrors.length ? pageErrors.join(" | ") : "无"}`);
console.log(`结果: ${results.length - failed.length}/${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
