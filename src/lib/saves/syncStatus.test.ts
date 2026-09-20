import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSyncStatus,
  resetSyncStatus,
  setSyncStatus,
  subscribeSyncStatus,
} from "./syncStatus";

describe("存档同步状态", () => {
  beforeEach(() => {
    resetSyncStatus();
  });

  it("初始状态：没有待写入的改动", () => {
    expect(getSyncStatus()).toEqual({
      phase: "idle",
      pendingCount: 0,
      lastSuccessAt: null,
      failures: 0,
      lastError: null,
    });
  });

  it("改一个字段，其余保持不变", () => {
    setSyncStatus({ phase: "syncing", pendingCount: 3 });
    expect(getSyncStatus()).toMatchObject({ phase: "syncing", pendingCount: 3 });
    expect(getSyncStatus().lastSuccessAt).toBeNull();
  });

  /**
   * 这一条钉的是 `useSyncExternalStore` 的契约：`getSnapshot` 必须返回**引用稳定**
   * 的值。每轮渲染都返回新对象会让 React 判定「变了」并无限重渲染。
   * 所以「无变化时不换引用」是必需的，不是优化。
   */
  it("写入相同的值不换引用、也不通知订阅者", () => {
    const before = getSyncStatus();
    const listener = vi.fn();
    subscribeSyncStatus(listener);

    setSyncStatus({ phase: "idle" });
    setSyncStatus({ pendingCount: 0 });
    setSyncStatus({ phase: "idle", pendingCount: 0, failures: 0 });

    expect(getSyncStatus()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("真的有变化时换引用并通知", () => {
    const before = getSyncStatus();
    const listener = vi.fn();
    subscribeSyncStatus(listener);

    setSyncStatus({ phase: "failed", failures: 1, lastError: "磁盘满" });

    expect(getSyncStatus()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSyncStatus().lastError).toBe("磁盘满");
  });

  it("退订之后不再收到通知", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSyncStatus(listener);

    setSyncStatus({ phase: "syncing" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setSyncStatus({ phase: "idle" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("多个订阅者都收到（界面上不止一处要显示状态）", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeSyncStatus(a);
    subscribeSyncStatus(b);

    setSyncStatus({ phase: "stopped", failures: 3 });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("失败后成功一次，失败计数与错误原因都清零", () => {
    setSyncStatus({ phase: "failed", failures: 2, lastError: "磁盘满" });
    setSyncStatus({ phase: "idle", failures: 0, lastSuccessAt: 123, lastError: null });

    expect(getSyncStatus()).toMatchObject({
      phase: "idle",
      failures: 0,
      lastError: null,
      lastSuccessAt: 123,
    });
  });
});
