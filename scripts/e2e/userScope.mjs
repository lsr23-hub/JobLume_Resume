import fs from "node:fs";
import path from "node:path";

/**
 * 多用户改造后，e2e 脚本共用的三件事。
 *
 * 1. **先有当前用户。** 改造前「导航到职业数据库」会惰性创建一份档案，脚本靠这个
 *    前提往 storage 里灌数据。现在门禁会拦下没有当前用户的访问，所以脚本必须先
 *    点一次「新建用户」。
 * 2. **档案的路径变了。** `state.profile`（标量）→
 *    `state.profiles[state.currentUserId]`（按用户索引）。
 * 3. **收尾清扫 `saves/`**（见文件末尾）。存档镜像一上线，每个脚本建的用户都会
 *    在盘上留一个目录，不清就会跟真数据混在一起。
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
const SAVES_ROOT = path.join(process.cwd(), "saves");
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
