import { useSyncExternalStore } from "react";
import {
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/saves/syncStatus";

/**
 * 订阅磁盘镜像状态。
 *
 * 第三个参数（服务端快照）**不能省**：SSR 下缺了它会直接抛错，而 hydration 时
 * 服务端与首帧客户端必须返回同一个值。这里传 `getSyncStatus` 是安全的 ——
 * 镜像只在浏览器里跑（`start()` 在 effect 里），服务端读到的永远是初始状态。
 */
export const useSavesSyncStatus = (): SyncStatus =>
  useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);

export default useSavesSyncStatus;
