import { useEffect, useSyncExternalStore } from "react";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useResumeStore } from "@/store/useResumeStore";
import { applyPull } from "@/lib/saves/applyPull";
import {
  getSession,
  refreshDirty,
  startSession,
  subscribeSession,
  switchTo,
  type SessionState,
} from "@/lib/saves/session";

/**
 * 保存会话的 React 接线。
 *
 * 职责刻意很窄：把三个 store 与当前用户喂给 `lib/saves/session.ts`，并把状态推给
 * 界面。**逻辑都在那边** —— 这个文件里没有"什么时候写盘"的判断。
 *
 * ⚠️ **没有自动写盘。** 写盘只发生在五个明确时机上（见 `plan/saves-design.md` §5）：
 * 点保存 / 切用户 / 关编辑器 / 页面隐藏 / 应用内离开。这里只做一件事 ——
 * 数据一变就**重算"哪些还没落盘"**，那是个纯读操作（哈希 + 比较），不发请求。
 *
 * 挂两处（工作台外壳与编辑器），与旧的镜像 hook 同样的理由：编辑器不在
 * `DashboardLayout` 之下。`start()` 有幂等守卫。
 */

/** 脏集重算的防抖窗口。**只影响状态显示**，不影响写盘 */
const REFRESH_DEBOUNCE_MS = 300;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const scheduleRefresh = (): void => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshDirty();
  }, REFRESH_DEBOUNCE_MS);
};

const start = (): void => {
  if (started || typeof window === "undefined") return;
  started = true;

  startSession({
    readUserId: () => useCareerProfileStore.getState().currentUserId,
    readSnapshot: (userId) => ({
      profile: useCareerProfileStore.getState().profiles[userId] ?? null,
      resumes: useResumeStore.getState().byUser[userId] ?? {},
      targets: useJobTargetStore.getState().targetsByUser[userId] ?? {},
    }),
    applyPull,
  });

  useCareerProfileStore.subscribe((state, prev) => {
    if (state.profiles !== prev.profiles) scheduleRefresh();
    if (state.currentUserId !== prev.currentUserId) {
      // 切用户：会话跟着装新用户的基线。**切换前要不要先存**由调用方决定
      // （`UserSelectDialog` 会先 `await save()`，失败就不切）——
      // 在订阅里做那件事做不到"失败就不切"，因为此时 store 已经切完了
      void switchTo(state.currentUserId);
    }
  });

  useResumeStore.subscribe((state, prev) => {
    if (state.byUser !== prev.byUser) scheduleRefresh();
  });

  useJobTargetStore.subscribe((state, prev) => {
    if (state.targetsByUser !== prev.targetsByUser) scheduleRefresh();
  });
};

export const useSavesSession = (): SessionState => {
  useEffect(() => {
    start();
  }, []);
  return useSyncExternalStore(subscribeSession, getSession, getSession);
};

export default useSavesSession;
