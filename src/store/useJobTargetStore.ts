import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";
import { generateUUID } from "@/utils/uuid";
import { reportHydrationFailure } from "@/store/persistGuard";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import {
  TARGET_SCOPE_VERSION,
  migrateTargetStateV2,
  normalizeTargetStateV2,
  targetsOf,
  type TargetPersistedV2,
} from "@/store/userScope";

export const JOB_TARGET_STORAGE_KEY = "job-target-storage";

interface JobTargetStore {
  // ── 持久化切片 ──
  /** 全部用户的投递目标，按 userId 分桶 */
  targetsByUser: Record<string, Record<string, JobTarget>>;

  // ── 当前用户的别名（不持久化）──
  /**
   * `targetsByUser[currentUserId]` 的别名。
   *
   * 为什么留别名而不是让调用方都换 selector：与 `useResumeStore` 同一个理由 ——
   * 页面按 `const { targets } = useJobTargetStore()` 取值，改成传 userId 要动
   * 一圈调用点。代价是每次写入都要重算它，所以写入统一走下面那层收口过的 `set`。
   */
  targets: Record<string, JobTarget>;

  addTarget: (input: { company: string; position: string; jdRaw: string; note?: string }) => string;
  updateTarget: (id: string, patch: Partial<Omit<JobTarget, "id" | "createdAt">>) => void;
  removeTarget: (id: string) => void;
  /** 写入分析结果与缓存 */
  setAnalysis: (id: string, analysis: MatchAnalysis, cache: AnalysisCache) => void;
  /** 切用户时把那个用户的岗位切片装进别名。由当前用户变化的订阅调用 */
  setActiveUser: (userId: string | null) => void;
  /** 删用户时清掉他名下的全部岗位 */
  purgeUser: (userId: string) => void;
  /**
   * 整体替换当前用户的岗位表（备份导入用）。
   *
   * **只能用这个 action，不能写 `useJobTargetStore.setState({ targets })`。**
   * store 上的 `setState` 是 zustand 原始的那个，不经过下面那层收口 ——
   * 只改别名、`targetsByUser` 原地不动，而 `partialize` 只存 `targetsByUser`。
   * 简历那边已经栽过一次，见 `useResumeStore.replaceResumes`。
   */
  replaceTargets: (targets: Record<string, JobTarget>) => void;
}

const warnedKeys = new Set<string>();

const safeLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      if (!warnedKeys.has(name)) {
        warnedKeys.add(name);
        console.warn(`[job-target] 写入 localStorage 失败，改动仅在本会话内有效。`, error);
      }
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
};

const touch = (target: JobTarget): JobTarget => ({
  ...target,
  updatedAt: new Date().toISOString(),
});

export const useJobTargetStore = create(
  persist<JobTargetStore, [], [], TargetPersistedV2>(
    (rawSet, get) => {
      /**
       * 唯一的写入出口 —— 与 `useResumeStore` 同款。
       *
       * 别名机制最容易写漏，所以把「写完别名跟着更新」收在一处：35 个 action 体
       * 闭包里的 `set` 就是下面这个，它们一个字都不用改。
       *
       * 与简历 store 唯一的差别是**没有当前用户时整个 no-op**，而不是放行去写
       * 别名：岗位 v2 起必须属于某个人，放行只会写进一个 merge 时会被抹掉的
       * 别名（界面上看得到、刷新就没了）。这跟档案 store 的 `put()` 是同一条纪律。
       */
      const set: typeof rawSet = (partial, replace) => {
        const next = (
          typeof partial === "function" ? partial(get()) : partial
        ) as Partial<JobTargetStore>;

        if (!("targets" in next)) {
          rawSet(partial as never, replace as never);
          return;
        }

        const userId = useCareerProfileStore.getState().currentUserId;
        if (!userId) return;

        rawSet({
          ...next,
          targetsByUser: { ...get().targetsByUser, [userId]: next.targets ?? {} },
        } as never);
      };

      return {
        targetsByUser: {},
        targets: {},

        addTarget: (input) => {
          const id = generateUUID();
          const now = new Date().toISOString();
          const target: JobTarget = {
            id,
            company: input.company,
            position: input.position,
            jdRaw: input.jdRaw,
            note: input.note,
            matchAnalysis: null,
            analysisCache: null,
            createdAt: now,
            updatedAt: now,
          };

          set({ targets: { ...get().targets, [id]: target } });
          return id;
        },

        updateTarget: (id, patch) => {
          const current = get().targets[id];
          if (!current) return;

          // JD 正文变了，旧的分析结果与缓存都不再对应当前输入。
          // 保留它们（用户可能只是手滑改了又改回来），由 checkCache 判断是否过期。
          set({ targets: { ...get().targets, [id]: touch({ ...current, ...patch }) } });
        },

        removeTarget: (id) => {
          const targets = { ...get().targets };
          delete targets[id];
          set({ targets });
        },

        setAnalysis: (id, analysis, cache) => {
          const current = get().targets[id];
          if (!current) return;

          // 不必再带 userId：岗位 v2 起就属于当前用户，分析写在自己的那份上
          set({
            targets: {
              ...get().targets,
              [id]: touch({ ...current, matchAnalysis: analysis, analysisCache: cache }),
            },
          });
        },

        setActiveUser: (userId) => {
          // 用 rawSet：这一步是「装载」，写回去会污染 targetsByUser
          rawSet({ targets: targetsOf(get(), userId) } as never);
        },

        purgeUser: (userId) => {
          const { [userId]: _dropped, ...targetsByUser } = get().targetsByUser;
          // 用 rawSet：这是一次整体替换，不该走镜像逻辑
          rawSet({ targetsByUser } as never);
          // 若删的正是当前用户，别名要跟着清空（档案 store 那边同时会把
          // currentUserId 置空，订阅也会再兜一次底）
          if (useCareerProfileStore.getState().currentUserId === userId) {
            rawSet({ targets: {} } as never);
          }
        },

        replaceTargets: (targets) => set({ targets }),
      };
    },
    {
      // 显式标出 state 的类型：签名里出现类型参数，persist 才能把 store 的类型推对
      onRehydrateStorage: (_state: JobTargetStore) => (_s?: JobTargetStore, error?: unknown) =>
        reportHydrationFailure("job-target", error),
      name: JOB_TARGET_STORAGE_KEY,
      storage: createJSONStorage<TargetPersistedV2>(() => safeLocalStorage),
      // version 与 migrate 必须一起加，理由见 persistGuard 的头注释
      version: TARGET_SCOPE_VERSION,
      migrate: (persisted, version) => migrateTargetStateV2(persisted, version),
      partialize: (state): TargetPersistedV2 => ({ targetsByUser: state.targetsByUser }),
      merge: (persistedState, currentState) => {
        // persistedState 在**首次访问**（storage 里还没有这个键）时是 undefined，
        // 另外「版本字段缺失」的 blob 根本不进 migrate、会原样落到这里 ——
        // normalizeTargetStateV2 是这两条路的共同防线。
        const { targetsByUser } = normalizeTargetStateV2(persistedState);
        return {
          ...currentState,
          targetsByUser,
          targets: targetsOf({ targetsByUser }, useCareerProfileStore.getState().currentUserId),
        };
      },
    }
  )
);

/**
 * 当前用户一变，就把那个用户的岗位切片装进别名。
 *
 * 与 `useResumeStore` 同一手法、同一理由：切人有两个入口（选择弹窗的选卡与
 * 新建），靠每个入口自己记得调，迟早漏一个。这是 `useJobTargetStore` 对
 * `useCareerProfileStore` 的第二处单向依赖（第一处是简历 store），仍然无环 ——
 * 档案 store 不反向依赖任何一个。
 */
useCareerProfileStore.subscribe((state, prev) => {
  if (state.currentUserId !== prev.currentUserId) {
    useJobTargetStore.getState().setActiveUser(state.currentUserId);
  }
});

/** 按创建时间倒序排列的投递目标列表 */
export const selectSortedTargets = (targets: Record<string, JobTarget>): JobTarget[] =>
  Object.values(targets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
