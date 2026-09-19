/**
 * 多用户改造后，e2e 脚本共用的两件事。
 *
 * 1. **先有当前用户。** 改造前「导航到职业数据库」会惰性创建一份档案，脚本靠这个
 *    前提往 storage 里灌数据。现在门禁会拦下没有当前用户的访问，所以脚本必须先
 *    点一次「新建用户」。
 * 2. **档案的路径变了。** `state.profile`（标量）→
 *    `state.profiles[state.currentUserId]`（按用户索引）。
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
  const dialog = page.locator('[role="dialog"]').filter({ hasText: "选择用户" });
  if (!(await dialog.isVisible().catch(() => false))) return false;

  await page.getByRole("button", { name: "新建用户" }).first().click();
  await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  return true;
};
