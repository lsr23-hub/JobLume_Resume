import { checkUnsaved, save } from "./session";

/**
 * 「离开前先问一句」的守卫 —— 应用内导航用（时机 ⑤）。
 *
 * 为什么单独一个模块：要问的那两个入口（侧边栏切板块、编辑器的返回）在完全不同的
 * 组件里，而对话框只能挂一处。放模块级单例，谁都能发起、只有一处渲染。
 *
 * **没有未落盘的改动就不打扰** —— 这是它存在的意义：绝大多数导航都是干净的。
 */

interface PendingLeave {
  /** 有几处没落盘 */
  count: number;
  /** 用户确认之后要做的事（真正的跳转） */
  proceed: () => void;
}

let pending: PendingLeave | null = null;
const listeners = new Set<() => void>();

export const getPendingLeave = (): PendingLeave | null => pending;

export const subscribePendingLeave = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (): void => {
  for (const listener of Array.from(listeners)) listener();
};

/**
 * 要不要先问一句。干净的导航**直接放行**（不产生任何等待感）。
 *
 * `checkUnsaved` 会先重算再回答 —— 脏集是防抖刷新的，"打完字立刻点导航"时它还落后
 * 几百毫秒，而那正是这个判定最该准的时候。
 */
export const guardLeave = async (proceed: () => void): Promise<void> => {
  const count = await checkUnsaved();
  if (count === 0) {
    proceed();
    return;
  }
  pending = { count, proceed };
  notify();
};

export type LeaveChoice =
  /** 保存并离开 */
  | "save"
  /** 直接离开：磁盘上仍是旧内容，改动留在浏览器里 */
  | "leave"
  | "cancel";

/**
 * 用户在对话框上做的选择。
 *
 * ⚠️ 注意 `leave` **不是"丢弃改动"**。设计文档 §5 写的是"丢弃内存改动"，但那基于旧模型
 * （当时假设基线内容在 localStorage、磁盘是真相源）。现在反过来：浏览器是工作副本、
 * 磁盘是备份 —— 所以"丢弃"没有对象。这个选项的诚实含义是"这次先不写盘"，
 * 文案也照这个说。
 */
export const resolveLeave = async (choice: LeaveChoice): Promise<void> => {
  const current = pending;
  if (!current) return;
  pending = null;
  notify();

  if (choice === "cancel") return;
  if (choice === "save") {
    // 存不上就**留在原地**。走了的话磁盘停在旧内容上，而用户以为已经存好了
    const ok = await save();
    if (!ok) return;
  }
  current.proceed();
};
