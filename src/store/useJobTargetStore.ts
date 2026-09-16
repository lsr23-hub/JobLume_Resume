import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";
import { generateUUID } from "@/utils/uuid";

export const JOB_TARGET_STORAGE_KEY = "job-target-storage";

interface JobTargetStore {
  targets: Record<string, JobTarget>;

  addTarget: (input: { company: string; position: string; jdRaw: string; note?: string }) => string;
  updateTarget: (id: string, patch: Partial<Omit<JobTarget, "id" | "createdAt">>) => void;
  removeTarget: (id: string) => void;
  /** 写入分析结果与缓存 */
  setAnalysis: (id: string, analysis: MatchAnalysis, cache: AnalysisCache) => void;
  /** 用户手动调整勾选状态后回写，用于「恢复 AI 建议」的差异识别 */
  setItemAdjusted: (id: string, entityId: string, adjusted: boolean) => void;
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

        set({
          targets: {
            ...get().targets,
            [id]: touch({ ...current, matchAnalysis: analysis, analysisCache: cache }),
          },
        });
      },

      setItemAdjusted: (id, entityId, adjusted) => {
        const current = get().targets[id];
        const item = current?.matchAnalysis?.items[entityId];
        if (!current?.matchAnalysis || !item) return;

        set({
          targets: {
            ...get().targets,
            [id]: {
              ...current,
              matchAnalysis: {
                ...current.matchAnalysis,
                items: {
                  ...current.matchAnalysis.items,
                  [entityId]: { ...item, manuallyAdjusted: adjusted },
                },
              },
            },
          },
        });
      },
    }),
    {
      name: JOB_TARGET_STORAGE_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ targets: state.targets }),
    }
  )
);

/** 按创建时间倒序排列的投递目标列表 */
export const selectSortedTargets = (targets: Record<string, JobTarget>): JobTarget[] =>
  Object.values(targets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
