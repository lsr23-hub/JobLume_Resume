import fs from "node:fs";
import path from "node:path";

/**
 * e2e 脚本共用的几件事。
 *
 * 1. **先有当前用户。** 改造前「导航到职业数据库」会惰性创建一份档案，脚本靠这个
 *    前提往 storage 里灌数据。现在门禁会拦下没有当前用户的访问，所以脚本必须先
 *    点一次「新建用户」。
 * 2. **档案的路径变了。** `state.profile`（标量）→
 *    `state.profiles[state.currentUserId]`（按用户索引）。
 * 3. **种子要同时写盘**（`seedSaves`）。应用改成从磁盘读之后，只灌 localStorage
 *    的种子会失效。
 * 4. **收尾清扫 `saves/`**（见文件末尾）。每个脚本建的用户都会在盘上留一个目录，
 *    不清就会跟真数据混在一起。
 *
 * 用 `.mjs` 而不是 `.ts`：`core-flow.mjs` / `editor-picker.mjs` / `legacy-template.mjs`
 * 是 JS，tsx 也能 import `.mjs`，一份 helper 两边都能用。
 */

/** 页面上下文里取当前档案的路径。形状再变时只改这一处 */
export const CURRENT_PROFILE_PATH = "state.profiles[state.currentUserId]";

/**
 * 若用户选择门禁正在拦路，就新建一个用户放行。
 *
 * 幂等：已经有当前用户时什么也不做。脚本在 `goto` 到板块页之后调用它。
 */
export const ensureCurrentUser = async (page) => {
  // 先看存储（快、不依赖渲染）。已经有当前用户就直接返回 —— 否则每次调用都要
  // 白等一个「弹窗始终不出现」的超时。
  const hasUser = await page
    .evaluate(() => {
      const st = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null")?.state;
      return Boolean(st?.currentUserId);
    })
    .catch(() => false);
  if (hasUser) return false;

  // 注意必须**等**弹窗出现：`goto` 之后 React 还没渲染完，直接 isVisible()
  // 会拿到 false，于是静默什么都不做 —— 脚本继续跑，然后在几十行之后以
  // 「简历桶是空的」这种毫不相干的症状炸掉。
  const dialog = page.locator('[role="dialog"]').filter({ hasText: "选择用户" });
  await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (!(await dialog.isVisible().catch(() => false))) return false;

  await page.getByRole("button", { name: "新建用户" }).first().click();
  await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  return true;
};

/** 存档根：`<仓库根>/saves/`，与 `lib/server/saves.ts` 的约定一致 */
export const savesDir = () => path.join(process.cwd(), "saves");

/** 当前用户 id。改造前从档案 blob 取，改造后从这里取 —— 两个都认 */
const readCurrentUserId = async (page) =>
  page.evaluate(() => {
    const direct = localStorage.getItem("joblume-current-user");
    if (direct) return direct;
    const st = JSON.parse(localStorage.getItem("career-profile-storage") ?? "null")?.state;
    return st?.currentUserId ?? null;
  });

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
};

/**
 * 把页面里刚种好的数据**也写一份到 `saves/<userId>/`**。
 *
 * 为什么要这样做：存档成为唯一真相源之后，应用改成**从磁盘读**，而这 8 个脚本的
 * 种子原本全是往 localStorage 灌的。让种子两边都写，翻转那一步就不必同时改
 * 8 个脚本；在翻转之前多写的这一份无害（应用仍从 localStorage 读，镜像随后会用
 * 同样的内容覆盖它）。
 *
 * ⚠️ **必须在 seed 之后、导航之前立刻调用。** 镜像的防抖 flush 会把内存里的状态
 * 写回磁盘，可能盖掉这里写下的种子；而调用点与随后的 `page.goto` 之间只隔一条
 * 语句，导航会连同页面上下文一起销毁那个定时器。中间别插 `waitForTimeout`。
 */
export const seedSaves = async (page) => {
  const userId = await readCurrentUserId(page);
  if (!userId) return null;

  const tree = await page.evaluate(() => {
    const state = (key) => JSON.parse(localStorage.getItem(key) ?? "null")?.state ?? null;
    const p = state("career-profile-storage");
    const r = state("resume-storage");
    const t = state("job-target-storage");
    const uid = localStorage.getItem("joblume-current-user") ?? p?.currentUserId ?? null;
    return {
      uid,
      profile: uid ? p?.profiles?.[uid] ?? p?.profile ?? null : null,
      resumes: uid ? r?.byUser?.[uid] ?? r?.resumes ?? {} : {},
      targets: uid ? t?.targetsByUser?.[uid] ?? t?.targets ?? {} : {},
    };
  });
  if (!tree.uid) return null;

  const dir = path.join(savesDir(), tree.uid);
  if (tree.profile) writeJson(path.join(dir, "profile.json"), tree.profile);
  for (const [id, data] of Object.entries(tree.resumes)) {
    writeJson(path.join(dir, "resumes", `${id}.json`), data);
  }
  for (const [id, data] of Object.entries(tree.targets)) {
    writeJson(path.join(dir, "jds", `${id}.json`), data);
  }

  // 也让「上次看的是谁」有个着落：改造后它不再跟着档案 blob 走
  await page.evaluate((uid) => localStorage.setItem("joblume-current-user", uid), tree.uid);
  return tree.uid;
};

/** 直接读盘上某个用户的某份存档（断言用，不经浏览器） */
export const readSaveFile = (userId, rel) => {
  const file = path.join(savesDir(), userId, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};

/** 某个用户目录下有哪些文件（相对路径，已排序） */
export const listSaveFiles = (userId) => {
  const dir = path.join(savesDir(), userId);
  const out = [];
  const walk = (base, prefix) => {
    if (!fs.existsSync(base)) return;
    for (const name of fs.readdirSync(base).sort()) {
      const full = path.join(base, name);
      if (fs.statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else out.push(`${prefix}${name}`);
    }
  };
  walk(dir, "");
  return out;
};

/**
 * 跑 e2e 会**真的往仓库根下的 `saves/` 写文件** —— 存档镜像一上线，每个脚本
 * 建出来的用户都会在盘上留一个目录。不清理的话，跑几轮之后 `saves/` 里就混满
 * 了空档案，和开发者的真数据分不出来。
 *
 * 做法：模块加载时（脚本刚起来、还没建任何用户之前）给 `saves/` 拍一张快照，
 * 进程退出时把**快照之外**的目录删掉。于是：
 * - 跑之前就存在的目录（真数据）一律不动
 * - 中途 throw / 断言失败也照样清 —— `exit` 钩子会跑，这正是它比
 *   「每个脚本自己在末尾写清理」强的地方（第一版就是这么漏掉一个孤儿目录的）
 *
 * 只用同步 API：`exit` 钩子里不允许异步。
 */
const SAVES_ROOT = savesDir();
const preexistingSaves = new Set(
  fs.existsSync(SAVES_ROOT) ? fs.readdirSync(SAVES_ROOT) : []
);

const sweepNewSaves = () => {
  if (!fs.existsSync(SAVES_ROOT)) return;
  for (const name of fs.readdirSync(SAVES_ROOT)) {
    if (preexistingSaves.has(name)) continue;
    try {
      fs.rmSync(path.join(SAVES_ROOT, name), { recursive: true, force: true });
    } catch {
      // 清理只是收尾，失败不该把脚本的退出码改掉
    }
  }
};

process.on("exit", sweepNewSaves);
