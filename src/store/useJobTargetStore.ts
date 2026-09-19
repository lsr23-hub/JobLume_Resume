import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";
import { generateUUID } from "@/utils/uuid";
import { reportHydrationFailure } from "@/store/persistGuard";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import {
  USER_SCOPE_VERSION,
  migrateTargetState,
  normalizeTargetState,
  withAnalysisFor,
} from "@/store/userScope";

export const JOB_TARGET_STORAGE_KEY = "job-target-storage";

interface JobTargetStore {
  targets: Record<string, JobTarget>;

  addTarget: (input: { company: string; position: string; jdRaw: string; note?: string }) => string;
  updateTarget: (id: string, patch: Partial<Omit<JobTarget, "id" | "createdAt">>) => void;
  removeTarget: (id: string) => void;
  /** 写入分析结果与缓存 */
  setAnalysis: (id: string, analysis: MatchAnalysis, cache: AnalysisCache) => void;
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

export const useJobTargetStore = create<JobTargetStore>()(
  persist(
    (set, get) => ({
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
          analysesByUser: {},
          cachesByUser: {},
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

        // 分析写在**当前用户**名下：同一个岗位，两个人各有一份自己的结论
        const userId = useCareerProfileStore.getState().currentUserId;
        if (!userId) return;

        set({
          targets: {
            ...get().targets,
            [id]: touch(withAnalysisFor(current, userId, analysis, cache)),
          },
        });
      },
    }),
    {
      // 显式标出 state 的类型：签名里出现类型参数，persist 才能把 store 的类型推对
      onRehydrateStorage: (_state: JobTargetStore) => (_s?: JobTargetStore, error?: unknown) =>
        reportHydrationFailure("job-target", error),
      name: JOB_TARGET_STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      // version 与 migrate 必须一起加，理由见 persistGuard 的头注释
      version: USER_SCOPE_VERSION,
      migrate: (persisted, version) => migrateTargetState(persisted, version),
      partialize: (state) => ({ targets: state.targets }),
      // 第二道防线：版本字段缺失的 blob 根本不进 migrate，会原样落到这里
      merge: (persisted, current) => ({
        ...current,
        targets: normalizeTargetState(persisted ?? {}),
      }),
    }
  )
);

/** 按创建时间倒序排列的投递目标列表 */
export const selectSortedTargets = (targets: Record<string, JobTarget>): JobTarget[] =>
  Object.values(targets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
