/**
 * persist 读取失败时的兜底。
 *
 * 起因：zustand 4.5.6 里 `version` 不匹配且没有 `migrate` 时，
 * `middleware.mjs` 那条分支**没有 return**，下一个 `.then` 解构 `undefined` 抛错，
 * 而 `.catch` 因为没有 `onRehydrateStorage` 会把错误**吞掉**。后果不是白屏，是：
 * store 停在初始值（空对象）→ 用户下一次写入时把**原有全部数据静默覆盖**。
 *
 * 这里只提供**日志**，不提供 option 工厂：`persist` 会从选项对象的属性反推
 * store 的类型，任何签名里不出现那个类型参数的工厂都会把推断污染成
 * `unknown`（实测过三种写法都失败）。所以接线由各 store 自己用一行内联箭头完成，
 * 上下文类型由 zustand 提供，不参与推断。
 *
 * 读取失败时**不要写入**：任何自动"修复"都可能把一份还能救的数据覆盖掉，
 * 让用户先看一眼控制台更安全。
 */
import { toast } from "sonner";

export const reportHydrationFailure = (label: string, error: unknown): void => {
  if (!error) return;

  const detail = error instanceof Error ? error.message : String(error);
  console.error(
    `[${label}] 本地数据读取失败：${detail}\n` +
      `本次会话会以空状态启动 —— 在确认数据没问题之前，请不要保存任何修改，` +
      `否则会把原有数据覆盖掉。`
  );

  toast.error(`本地数据读取失败（${label}）`, {
    description: "已按空数据启动。先别保存修改，详情见浏览器控制台。",
    duration: 10000,
  });
};
