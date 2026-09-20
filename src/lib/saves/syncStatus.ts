/**
 * 磁盘镜像的**可见状态**。
 *
 * 为什么需要它：同步失败原来是静默的 —— 连续 3 批失败后内部 `gaveUp = true`，
 * 只 `console.warn` 一句，界面上没有任何痕迹。在开了 `SAVES_ENABLED=1` 的部署上
 * （磁盘满、权限错、目录被删），用户会以为数据已经写到磁盘，而盘上其实是旧内容。
 *
 * 这里**只放状态，不放逻辑**：谁写（`hooks/useSavesMirror.ts`）谁读
 * （`SaveBar`）都与它无关。这样状态本身可以脱离浏览器直接测。
 *
 * `useSyncExternalStore` 要求 `getSnapshot` 返回**引用稳定**的值 —— 每轮渲染都
 * 返回新对象会让 React 判定「变了」并无限重渲染。所以快照是模块级不可变对象，
 * 只有字段真的变了才整体替换。
 */

export type SyncPhase =
  /** 没有待写入的改动 */
  | "idle"
  /** 正在写 */
  | "syncing"
  /** 写失败，但还会自动重试 */
  | "failed"
  /** 连续失败到上限，已停止自动重试（用户可手动重试） */
  | "stopped"
  /** 本次部署没有磁盘存档（端点 404）。这是正常部署形态，不是故障 */
  | "disabled";

export interface SyncStatus {
  phase: SyncPhase;
  /** 待写入磁盘的条目数（含失败的） */
  pendingCount: number;
  /** 本会话内最后一次写盘成功的时刻。刷新后归零 —— 那是"本会话"，不是"历史上" */
  lastSuccessAt: number | null;
  /** 连续失败的批次数。成功一次即清零 */
  failures: number;
  /** 最近一次失败的原因（服务端返回的原文，截断）。成功一次即清空 */
  lastError: string | null;
}

const INITIAL: SyncStatus = {
  phase: "idle",
  pendingCount: 0,
  lastSuccessAt: null,
  failures: 0,
  lastError: null,
};

let snapshot: SyncStatus = INITIAL;
const listeners = new Set<() => void>();

export const getSyncStatus = (): SyncStatus => snapshot;

export const subscribeSyncStatus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 逐字段比较。**不能省** —— 见文件头关于引用稳定性的说明 */
const sameStatus = (a: SyncStatus, b: SyncStatus): boolean =>
  a.phase === b.phase &&
  a.pendingCount === b.pendingCount &&
  a.lastSuccessAt === b.lastSuccessAt &&
  a.failures === b.failures &&
  a.lastError === b.lastError;

export const setSyncStatus = (patch: Partial<SyncStatus>): void => {
  const next: SyncStatus = { ...snapshot, ...patch };
  if (sameStatus(next, snapshot)) return;
  snapshot = next;
  for (const listener of Array.from(listeners)) listener();
};

/**
 * 复位。**只有测试用**：模块级单例会在用例之间互相污染，
 * 而 `vitest` 每个文件一个 worker 不代表同一文件内会重新求值模块。
 */
export const resetSyncStatus = (): void => {
  setSyncStatus(INITIAL);
};
