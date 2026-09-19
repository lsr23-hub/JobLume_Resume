import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";
import { getFileHandle, verifyPermission } from "@/utils/fileSystem";
import {
  BasicInfo,
  Education,
  Experience,
  GlobalSettings,
  Project,
  CustomItem,
  ResumeData,
  MenuSection,
  Certificate,
} from "../types/resume";
import { DEFAULT_TEMPLATES } from "@/config";
import {
  initialResumeState,
  initialResumeStateEn,
  blankResumeState,
  blankResumeStateEn,
} from "@/config/initialResumeData";
import { generateUUID } from "@/utils/uuid";
import {
  HISTORY_LIMIT,
  type UpdateResumeOptions,
  cloneResume,
  getHistoryKey,
  shouldPushHistoryEntry,
  pushHistory,
  restoreResumeSnapshot,
  clearHistoryGroup,
} from "./resumeHistory";
import { reportHydrationFailure } from "@/store/persistGuard";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import {
  USER_SCOPE_VERSION,
  migrateResumeState,
  normalizeResumeState,
  type ResumePersisted,
} from "@/store/userScope";

interface PendingSync {
  timer: ReturnType<typeof setTimeout>;
  prevResume?: ResumeData;
}

interface ResumeStore {
  // ── 持久化切片 ──
  /** 全部用户的简历，按 userId 分桶 */
  byUser: Record<string, Record<string, ResumeData>>;
  /** 各用户当前打开的那一份 */
  activeByUser: Record<string, string | null>;

  // ── 当前用户的别名（不持久化）──
  /**
   * `byUser[currentUserId]` 的别名。
   *
   * 为什么留这三个而不是让调用方都换 selector：全仓 33 个文件按
   * `const { activeResume, updateX } = useResumeStore()` 取值，改成传参要动 33 处。
   * 代价是每次写入都要重算它们 —— 所以写入统一走下面那个包装过的 `set`。
   */
  resumes: Record<string, ResumeData>;
  activeResumeId: string | null;
  activeResume: ResumeData | null;
  history: Record<string, ResumeData[]>;
  future: Record<string, ResumeData[]>;

  createResume: (templateId: string | null, isBlank?: boolean) => string;
  deleteResume: (resume: ResumeData) => void;
  duplicateResume: (resumeId: string) => string;
  updateResume: (
    resumeId: string,
    data: Partial<ResumeData>,
    options?: UpdateResumeOptions
  ) => void;
  setActiveResume: (resumeId: string) => void;
  /** 切用户时把那个用户的简历切片装进别名。由当前用户变化的订阅调用 */
  setActiveUser: (userId: string | null) => void;
  /** 删用户时清掉他名下的全部简历。若删的是当前用户，别名也会被清空 */
  purgeUser: (userId: string) => void;
  /**
   * 整体替换当前用户的简历表（备份导入用）。
   *
   * **只能用这个 action，不能写 `useResumeStore.setState({ resumes })`。**
   * store 上的 `setState` 是 zustand 原始的那个，不经过下面那层收口 ——
   * 它只改别名，`byUser` 原地不动，而 `partialize` 恰好只存 `byUser`，
   * 于是导入的简历在界面上一应俱全、刷新之后全部消失。
   */
  replaceResumes: (resumes: Record<string, ResumeData>) => void;
  updateResumeFromFile: (
    resume: ResumeData,
    sourceModifiedAt?: number
  ) => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  updateResumeTitle: (title: string) => void;
  updateBasicInfo: (data: Partial<BasicInfo>) => void;
  updateEducation: (data: Education) => void;
  updateEducationBatch: (educations: Education[]) => void;
  deleteEducation: (id: string) => void;
  updateExperience: (data: Experience) => void;
  updateExperienceBatch: (experiences: Experience[]) => void;
  deleteExperience: (id: string) => void;
  updateProjects: (project: Project) => void;
  updateProjectsBatch: (projects: Project[]) => void;
  deleteProject: (id: string) => void;
  setDraggingProjectId: (id: string | null) => void;
  updateSkillContent: (skillContent: string) => void;
  updateSelfEvaluationContent: (content: string) => void;
  reorderSections: (newOrder: ResumeData["menuSections"]) => void;
  toggleSectionVisibility: (sectionId: string) => void;
  setActiveSection: (sectionId: string) => void;
  updateMenuSections: (sections: ResumeData["menuSections"]) => void;
  createCustomSection: (section: MenuSection) => void;
  updateCustomData: (sectionId: string, items: CustomItem[]) => void;
  removeCustomData: (sectionId: string) => void;
  addCustomItem: (sectionId: string) => void;
  updateCustomItem: (
    sectionId: string,
    itemId: string,
    updates: Partial<CustomItem>
  ) => void;
  removeCustomItem: (sectionId: string, itemId: string) => void;
  updateGlobalSettings: (settings: Partial<GlobalSettings>) => void;
  setThemeColor: (color: string) => void;
  setTemplate: (templateId: string) => void;
  addResume: (resume: ResumeData) => string;
  addCertificate: (certificate: Certificate) => void;
  updateCertificate: (id: string, updates: Partial<Certificate>) => void;
  updateCertificatesBatch: (certificates: Certificate[]) => void;
  removeCertificate: (id: string) => void;
}

// 持久化切片：按用户分桶。类型定义在 userScope（迁移函数与它同源）
type PersistedResumeStore = ResumePersisted;

const createDefaultCustomItem = (): CustomItem => ({
  id: generateUUID(),
  title: "未命名模块",
  subtitle: "",
  dateRange: "",
  description: "",
  visible: true,
});

const warnedPersistFailures = new Set<string>();

const warnPersistFailure = (name: string, error: unknown) => {
  if (warnedPersistFailures.has(name)) {
    return;
  }

  warnedPersistFailures.add(name);
  console.warn(
    `[resume-store] Failed to persist "${name}" to localStorage. Changes remain available in memory for this session.`,
    error
  );
};

const createSafeLocalStorage = (): StateStorage => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      warnPersistFailure(name, error);
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
});

const parseTimestamp = (value?: string): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const shouldImportResumeFromFile = (
  fileResume: ResumeData,
  localResume?: ResumeData,
  sourceModifiedAt?: number
) => {
  if (!localResume) {
    return true;
  }

  const fileUpdatedAt = parseTimestamp(fileResume.updatedAt);
  const localUpdatedAt = parseTimestamp(localResume.updatedAt);
  const fileModifiedAt =
    typeof sourceModifiedAt === "number" && Number.isFinite(sourceModifiedAt)
      ? sourceModifiedAt
      : null;

  if (fileUpdatedAt !== null && localUpdatedAt !== null) {
    if (fileUpdatedAt !== localUpdatedAt) {
      return fileUpdatedAt > localUpdatedAt;
    }

    return fileModifiedAt !== null && fileModifiedAt > localUpdatedAt + 1000;
  }

  if (fileUpdatedAt !== null && localUpdatedAt === null) {
    return true;
  }

  if (fileUpdatedAt === null && localUpdatedAt !== null) {
    return fileModifiedAt !== null && fileModifiedAt > localUpdatedAt + 1000;
  }

  return fileModifiedAt !== null;
};

const normalizeImportedResume = (
  resume: ResumeData,
  sourceModifiedAt?: number
) => {
  if (
    typeof sourceModifiedAt !== "number" ||
    !Number.isFinite(sourceModifiedAt)
  ) {
    return resume;
  }

  const fileUpdatedAt = parseTimestamp(resume.updatedAt);
  if (fileUpdatedAt !== null && fileUpdatedAt >= sourceModifiedAt) {
    return resume;
  }

  return {
    ...resume,
    updatedAt: new Date(sourceModifiedAt).toISOString(),
  };
};

// 同步简历到文件系统
const syncResumeToFile = async (
  resumeData: ResumeData,
  prevResume?: ResumeData
) => {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return;
  }

  try {
    const handle = await getFileHandle("syncDirectory");
    if (!handle) {
      return;
    }

    const hasPermission = await verifyPermission(handle);
    if (!hasPermission) {
      return;
    }

    const dirHandle = handle as FileSystemDirectoryHandle;

    if (
      prevResume &&
      prevResume.id === resumeData.id &&
      prevResume.title !== resumeData.title
    ) {
      try {
        await dirHandle.removeEntry(`${prevResume.title}.json`);
      } catch (error) {
        console.warn("Error deleting old file:", error);
      }
    }

    const fileName = `${resumeData.title}.json`;
    const fileHandle = await dirHandle.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(resumeData, null, 2));
    await writable.close();
  } catch (error) {
    console.error("Error syncing resume to file:", error);
  }
};

// 防抖同步：按简历合并高频写入，避免不同简历之间互相取消文件同步
const pendingSyncs = new Map<string, PendingSync>();

const clearPendingSync = (resumeId: string) => {
  const pendingSync = pendingSyncs.get(resumeId);
  if (!pendingSync) {
    return;
  }

  clearTimeout(pendingSync.timer);
  pendingSyncs.delete(resumeId);
};

const debouncedSyncToFile = (
  resumeData: ResumeData,
  prevResume?: ResumeData
) => {
  const pendingSync = pendingSyncs.get(resumeData.id);
  if (pendingSync) {
    clearTimeout(pendingSync.timer);
  }

  const prevResumeForSync = pendingSync?.prevResume ?? prevResume;
  const timer = setTimeout(() => {
    syncResumeToFile(resumeData, prevResumeForSync);
    pendingSyncs.delete(resumeData.id);
  }, 1500);

  pendingSyncs.set(resumeData.id, {
    timer,
    prevResume: prevResumeForSync,
  });
};

export const useResumeStore = create(
  persist<ResumeStore, [], [], PersistedResumeStore>(
    (rawSet, get) => {
      /**
       * 唯一的写入出口。
       *
       * 与档案 store 的 `put()` 同一个思路 —— 别名机制最容易写漏，所以把
       * 「写完别名跟着更新」收在一处。区别是这里收在 `set` 这一层：35 个
       * action 体因此一个字都不用改（它们闭包里的 `set` 就是下面这个）。
       *
       * 只关心 `resumes` / `activeResumeId` 的写入；写别的字段（history、
       * future）原样透传。
       */
      const set: typeof rawSet = (partial, replace) => {
        const next = (
          typeof partial === "function" ? partial(get()) : partial
        ) as Partial<ResumeStore>;
        const touchesResumes = "resumes" in next || "activeResumeId" in next;
        const userId = useCareerProfileStore.getState().currentUserId;

        if (!touchesResumes || !userId) {
          rawSet(partial as never, replace as never);
          return;
        }

        const state = get();
        const resumes = next.resumes ?? state.resumes;
        const activeResumeId =
          "activeResumeId" in next ? next.activeResumeId ?? null : state.activeResumeId;

        rawSet({
          ...next,
          byUser: { ...state.byUser, [userId]: resumes },
          activeByUser: { ...state.activeByUser, [userId]: activeResumeId },
          activeResume: activeResumeId ? resumes[activeResumeId] ?? null : null,
        } as never);
      };

      return {
      byUser: {},
      activeByUser: {},
      resumes: {},
      activeResumeId: null,
      activeResume: null,
      history: {},
      future: {},

      createResume: (templateId = null, isBlank = false) => {
        const locale =
          typeof document !== "undefined"
            ? document.cookie
                .split("; ")
                .find((row) => row.startsWith("NEXT_LOCALE="))
                ?.split("=")[1] || "zh"
            : "zh";

        let initialResumeData: any;
        if (isBlank) {
          initialResumeData =
            locale === "en" ? blankResumeStateEn : blankResumeState;
        } else {
          initialResumeData =
            locale === "en" ? initialResumeStateEn : initialResumeState;
        }

        const id = generateUUID();
        const template = templateId
          ? DEFAULT_TEMPLATES.find((t) => t.id === templateId)
          : DEFAULT_TEMPLATES[0];

        const newResume: ResumeData = {
          ...initialResumeData,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          templateId: template?.id,
          title: `${locale === "en" ? "New Resume" : "新建简历"} ${id.slice(
            0,
            6
          )}`,
        };

        set((state) => ({
          resumes: {
            ...state.resumes,
            [id]: newResume,
          },
          activeResumeId: id,
          activeResume: newResume,
          history: {
            ...state.history,
            [id]: [],
          },
          future: {
            ...state.future,
            [id]: [],
          },
        }));

        syncResumeToFile(newResume);

        return id;
      },

      updateResume: (resumeId, data, options) => {
        set((state) => {
          const resume = state.resumes[resumeId];
          if (!resume) return state;

          const historyKey = getHistoryKey(data, options);
          const shouldPushHistory =
            !!historyKey && shouldPushHistoryEntry(resumeId, historyKey);
          const shouldClearFuture = !!historyKey;
          const updatedResume = {
            ...resume,
            ...data,
            updatedAt: new Date().toISOString(),
          };

          debouncedSyncToFile(updatedResume, resume);

          return {
            resumes: {
              ...state.resumes,
              [resumeId]: updatedResume,
            },
            activeResume:
              state.activeResumeId === resumeId
                ? updatedResume
                : state.activeResume,
            history: shouldPushHistory
              ? pushHistory(state.history, resumeId, resume)
              : state.history,
            future: shouldClearFuture
              ? {
                  ...state.future,
                  [resumeId]: [],
                }
              : state.future,
          };
        });
      },

      // 从文件更新，直接更新resumes
      updateResumeFromFile: (resume, sourceModifiedAt) => {
        const localResume = get().resumes[resume.id];
        if (!shouldImportResumeFromFile(resume, localResume, sourceModifiedAt)) {
          return false;
        }

        const importedResume = normalizeImportedResume(resume, sourceModifiedAt);
        clearHistoryGroup(importedResume.id);
        clearPendingSync(importedResume.id);

        set((state) => ({
          resumes: {
            ...state.resumes,
            [importedResume.id]: importedResume,
          },
          activeResume:
            state.activeResumeId === importedResume.id
              ? importedResume
              : state.activeResume,
          history: {
            ...state.history,
            [importedResume.id]: [],
          },
          future: {
            ...state.future,
            [importedResume.id]: [],
          },
        }));

        return true;
      },

      undo: () => {
        const { activeResumeId } = get();
        if (!activeResumeId) return;

        set((state) => {
          const currentResume = state.resumes[activeResumeId];
          const resumeHistory = state.history[activeResumeId] ?? [];
          const previousResume = resumeHistory[resumeHistory.length - 1];
          if (!currentResume || !previousResume) return state;

          const restoredResume = restoreResumeSnapshot(
            previousResume,
            currentResume
          );
          clearHistoryGroup(activeResumeId);

          debouncedSyncToFile(restoredResume, currentResume);

          return {
            resumes: {
              ...state.resumes,
              [activeResumeId]: restoredResume,
            },
            activeResume: restoredResume,
            history: {
              ...state.history,
              [activeResumeId]: resumeHistory.slice(0, -1),
            },
            future: {
              ...state.future,
              [activeResumeId]: [
                cloneResume(currentResume),
                ...(state.future[activeResumeId] ?? []),
              ].slice(0, HISTORY_LIMIT),
            },
          };
        });
      },

      redo: () => {
        const { activeResumeId } = get();
        if (!activeResumeId) return;

        set((state) => {
          const currentResume = state.resumes[activeResumeId];
          const resumeFuture = state.future[activeResumeId] ?? [];
          const nextResume = resumeFuture[0];
          if (!currentResume || !nextResume) return state;

          const restoredResume = restoreResumeSnapshot(
            nextResume,
            currentResume
          );
          clearHistoryGroup(activeResumeId);

          debouncedSyncToFile(restoredResume, currentResume);

          return {
            resumes: {
              ...state.resumes,
              [activeResumeId]: restoredResume,
            },
            activeResume: restoredResume,
            history: pushHistory(state.history, activeResumeId, currentResume),
            future: {
              ...state.future,
              [activeResumeId]: resumeFuture.slice(1),
            },
          };
        });
      },

      canUndo: () => {
        const { activeResumeId, history } = get();
        return !!activeResumeId && (history[activeResumeId]?.length ?? 0) > 0;
      },

      canRedo: () => {
        const { activeResumeId, future } = get();
        return !!activeResumeId && (future[activeResumeId]?.length ?? 0) > 0;
      },

      updateResumeTitle: (title) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { title });
        }
      },

      deleteResume: (resume) => {
        const resumeId = resume.id;
        clearHistoryGroup(resumeId);
        clearPendingSync(resumeId);
        set((state) => {
          const { [resumeId]: _, activeResume, ...rest } = state.resumes;
          const { [resumeId]: __, ...historyRest } = state.history;
          const { [resumeId]: ___, ...futureRest } = state.future;
          return {
            resumes: rest,
            activeResumeId: null,
            activeResume: null,
            history: historyRest,
            future: futureRest,
          };
        });

        (async () => {
          try {
            const handle = await getFileHandle("syncDirectory");
            if (!handle) return;

            const hasPermission = await verifyPermission(handle);
            if (!hasPermission) return;

            const dirHandle = handle as FileSystemDirectoryHandle;
            try {
              await dirHandle.removeEntry(`${resume.title}.json`);
            } catch (error) {}
          } catch (error) {
            console.error("Error deleting resume file:", error);
          }
        })();
      },

      duplicateResume: (resumeId) => {
        const newId = generateUUID();
        const originalResume = get().resumes[resumeId];
        if (!originalResume) {
          return "";
        }

        // 获取当前语言环境
        const locale =
          typeof document !== "undefined"
            ? document.cookie
                .split("; ")
                .find((row) => row.startsWith("NEXT_LOCALE="))
                ?.split("=")[1] || "zh"
            : "zh";

        const duplicatedResume = {
          ...structuredClone(originalResume),
          id: newId,
          title: `${originalResume.title} (${
            locale === "en" ? "Copy" : "复制"
          })`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          resumes: {
            ...state.resumes,
            [newId]: duplicatedResume,
          },
          activeResumeId: newId,
          activeResume: duplicatedResume,
          history: {
            ...state.history,
            [newId]: [],
          },
          future: {
            ...state.future,
            [newId]: [],
          },
        }));

        return newId;
      },

      setActiveResume: (resumeId) => {
        const { resumes, activeResume, activeResumeId } = get();
        const nextResume = resumes[resumeId] ?? null;

        if (activeResumeId === resumeId && activeResume === nextResume) {
          return;
        }

        set({ activeResume: nextResume, activeResumeId: resumeId });
      },

      updateBasicInfo: (data) => {
        const { activeResumeId, activeResume } = get();
        if (activeResumeId && activeResume) {
          get().updateResume(activeResumeId, {
            basic: {
              ...activeResume.basic,
              ...data,
            },
          });
        }
      },

      updateEducation: (education) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const newEducation = currentResume.education.some(
          (e) => e.id === education.id
        )
          ? currentResume.education.map((e) =>
              e.id === education.id ? education : e
            )
          : [...currentResume.education, education];

        get().updateResume(activeResumeId, { education: newEducation });
      },

      updateEducationBatch: (educations) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { education: educations });
        }
      },

      deleteEducation: (id) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const resume = get().resumes[activeResumeId];
          const updatedEducation = resume.education.filter((e) => e.id !== id);
          get().updateResume(activeResumeId, { education: updatedEducation });
        }
      },

      updateExperience: (experience) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const newExperience = currentResume.experience.find(
          (e) => e.id === experience.id
        )
          ? currentResume.experience.map((e) =>
              e.id === experience.id ? experience : e
            )
          : [...currentResume.experience, experience];

        get().updateResume(activeResumeId, { experience: newExperience });
      },

      updateExperienceBatch: (experiences: Experience[]) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const updateData = { experience: experiences };
          get().updateResume(activeResumeId, updateData);
        }
      },
      deleteExperience: (id) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const updatedExperience = currentResume.experience.filter(
          (e) => e.id !== id
        );

        get().updateResume(activeResumeId, { experience: updatedExperience });
      },

      updateProjects: (project) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;
        const currentResume = resumes[activeResumeId];
        const newProjects = currentResume.projects.some(
          (p) => p.id === project.id
        )
          ? currentResume.projects.map((p) =>
              p.id === project.id ? project : p
            )
          : [...currentResume.projects, project];

        get().updateResume(activeResumeId, { projects: newProjects });
      },

      updateProjectsBatch: (projects: Project[]) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const updateData = { projects };
          get().updateResume(activeResumeId, updateData);
        }
      },

      deleteProject: (id) => {
        const { activeResumeId } = get();
        if (!activeResumeId) return;
        const currentResume = get().resumes[activeResumeId];
        const updatedProjects = currentResume.projects.filter(
          (p) => p.id !== id
        );
        get().updateResume(activeResumeId, { projects: updatedProjects });
      },

      setDraggingProjectId: (id: string | null) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(
            activeResumeId,
            { draggingProjectId: id },
            { recordHistory: false }
          );
        }
      },

      updateSkillContent: (skillContent) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { skillContent });
        }
      },

      updateSelfEvaluationContent: (selfEvaluationContent) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { selfEvaluationContent });
        }
      },

      reorderSections: (newOrder) => {
        const { activeResumeId, resumes } = get();
        if (activeResumeId) {
          const currentResume = resumes[activeResumeId];
          const basicInfoSection = currentResume.menuSections.find(
            (section) => section.id === "basic"
          );
          const reorderedSections = [
            basicInfoSection,
            ...newOrder.filter((section) => section.id !== "basic"),
          ].map((section, index) => ({
            ...section,
            order: index,
          }));
          get().updateResume(activeResumeId, {
            menuSections: reorderedSections as MenuSection[],
          });
        }
      },

      toggleSectionVisibility: (sectionId) => {
        const { activeResumeId, resumes } = get();
        if (activeResumeId) {
          const currentResume = resumes[activeResumeId];
          const updatedSections = currentResume.menuSections.map((section) =>
            section.id === sectionId
              ? { ...section, enabled: !section.enabled }
              : section
          );
          get().updateResume(activeResumeId, { menuSections: updatedSections });
        }
      },

      setActiveSection: (sectionId) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(
            activeResumeId,
            { activeSection: sectionId },
            { recordHistory: false }
          );
        }
      },

      updateMenuSections: (sections) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { menuSections: sections });
        }
      },

      createCustomSection: (section) => {
        const { activeResumeId } = get();
        if (!activeResumeId) return;

        const currentResume = get().resumes[activeResumeId];
        get().updateResume(activeResumeId, {
          menuSections: [...currentResume.menuSections, section],
          customData: {
            ...currentResume.customData,
            [section.id]: [createDefaultCustomItem()],
          },
          activeSection: section.id,
        });
      },

      updateCustomData: (sectionId, items) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const currentResume = get().resumes[activeResumeId];
          const updatedCustomData = {
            ...currentResume.customData,
            [sectionId]: items,
          };
          get().updateResume(activeResumeId, { customData: updatedCustomData });
        }
      },

      removeCustomData: (sectionId) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const currentResume = get().resumes[activeResumeId];
          const { [sectionId]: _, ...rest } = currentResume.customData;
          get().updateResume(activeResumeId, { customData: rest });
        }
      },

      addCustomItem: (sectionId) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const currentResume = get().resumes[activeResumeId];
          const updatedCustomData = {
            ...currentResume.customData,
            [sectionId]: [
              ...(currentResume.customData[sectionId] || []),
              createDefaultCustomItem(),
            ],
          };
          get().updateResume(activeResumeId, { customData: updatedCustomData });
        }
      },

      updateCustomItem: (sectionId, itemId, updates) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const currentResume = get().resumes[activeResumeId];
          const updatedCustomData = {
            ...currentResume.customData,
            [sectionId]: currentResume.customData[sectionId].map((item) =>
              item.id === itemId ? { ...item, ...updates } : item
            ),
          };
          get().updateResume(activeResumeId, { customData: updatedCustomData });
        }
      },

      removeCustomItem: (sectionId, itemId) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          const currentResume = get().resumes[activeResumeId];
          const updatedCustomData = {
            ...currentResume.customData,
            [sectionId]: currentResume.customData[sectionId].filter(
              (item) => item.id !== itemId
            ),
          };
          get().updateResume(activeResumeId, { customData: updatedCustomData });
        }
      },

      addCertificate: (certificate) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const newCertificates = currentResume.certificates.some(
          (c) => c.id === certificate.id
        )
          ? currentResume.certificates.map((c) =>
              c.id === certificate.id ? certificate : c
            )
          : [...currentResume.certificates, certificate];

        get().updateResume(activeResumeId, { certificates: newCertificates });
      },

      updateCertificate: (id, updates) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const newCertificates = currentResume.certificates.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        );

        get().updateResume(activeResumeId, { certificates: newCertificates });
      },

      updateCertificatesBatch: (certificates) => {
        const { activeResumeId } = get();
        if (activeResumeId) {
          get().updateResume(activeResumeId, { certificates });
        }
      },

      removeCertificate: (id) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const currentResume = resumes[activeResumeId];
        const updatedCertificates = currentResume.certificates.filter(
          (c) => c.id !== id
        );

        get().updateResume(activeResumeId, { certificates: updatedCertificates });
      },

      updateGlobalSettings: (settings: Partial<GlobalSettings>) => {
        const { activeResumeId, updateResume, activeResume } = get();
        if (activeResumeId) {
          updateResume(activeResumeId, {
            globalSettings: {
              ...activeResume?.globalSettings,
              ...settings,
            },
          });
        }
      },

      setThemeColor: (color) => {
        const { activeResumeId, updateResume } = get();
        if (activeResumeId) {
          updateResume(activeResumeId, {
            globalSettings: {
              ...get().activeResume?.globalSettings,
              themeColor: color,
            },
          });
        }
      },

      setTemplate: (templateId) => {
        const { activeResumeId, resumes } = get();
        if (!activeResumeId) return;

        const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
        if (!template) return;

        get().updateResume(activeResumeId, {
          templateId,
          globalSettings: {
            ...resumes[activeResumeId].globalSettings,
            themeColor: template.colorScheme.primary,
            sectionSpacing: template.spacing.sectionGap,
            paragraphSpacing: template.spacing.itemGap,
            pagePadding: template.spacing.contentPadding,
          },
          basic: {
            ...resumes[activeResumeId].basic,
            layout: template.basic.layout,
          },
        });
      },
      addResume: (resume: ResumeData) => {
        set((state) => ({
          resumes: {
            ...state.resumes,
            [resume.id]: resume,
          },
          activeResumeId: resume.id,
          activeResume: resume,
          history: {
            ...state.history,
            [resume.id]: [],
          },
          future: {
            ...state.future,
            [resume.id]: [],
          },
        }));

        syncResumeToFile(resume);
        return resume.id;
      },

      purgeUser: (userId) => {
        const { [userId]: _dropped, ...byUser } = get().byUser;
        const { [userId]: _droppedActive, ...activeByUser } = get().activeByUser;
        // 用 rawSet：这是一次整体替换，不该走镜像逻辑
        rawSet({ byUser, activeByUser } as never);
        // 若删的正是当前用户，别名要跟着清空（档案 store 那边同时会把
        // currentUserId 置空，订阅也会再兜一次底）
        if (useCareerProfileStore.getState().currentUserId === userId) {
          rawSet({ resumes: {}, activeResumeId: null, activeResume: null } as never);
        }
      },

      setActiveUser: (userId) => {
        const { byUser, activeByUser } = get();
        const resumes = (userId ? byUser[userId] : undefined) ?? {};
        const activeResumeId = (userId ? activeByUser[userId] : null) ?? null;
        // 用 rawSet：这一步是「装载」，写回去会污染 byUser
        rawSet({
          resumes,
          activeResumeId,
          activeResume: activeResumeId ? resumes[activeResumeId] ?? null : null,
        } as never);
      },

      replaceResumes: (resumes) => {
        // 与档案 store 的 `put()` 同一纪律：没有当前用户就没有归属，不写。
        // （否则会写进一个谁也读不到的别名，下次 merge 直接抹掉）
        if (!useCareerProfileStore.getState().currentUserId) return;

        // 换掉整张表之后，原来打开的那一份可能已经不在表里了。
        // 顺着它算 activeResume 会指向一份已经删除的简历
        const current = get().activeResumeId;
        const activeResumeId = current && resumes[current] ? current : null;
        set({ resumes, activeResumeId });
      },
      };
    },
    {
      // 显式标出 state 的类型：签名里出现类型参数，persist 才能把 store 的类型推对
      onRehydrateStorage: (_state: ResumeStore) => (_s?: ResumeStore, error?: unknown) =>
        reportHydrationFailure("resume", error),
      name: "resume-storage",
      storage: createJSONStorage<ResumePersisted>(() =>
        createSafeLocalStorage()
      ),
      // version 与 migrate 必须一起加，理由见 persistGuard 的头注释
      version: USER_SCOPE_VERSION,
      migrate: (persisted, version) => migrateResumeState(persisted, version),
      partialize: (state): ResumePersisted => ({
        byUser: state.byUser,
        activeByUser: state.activeByUser,
      }),
      merge: (persistedState, currentState) => {
        // persistedState 在**首次访问**（storage 里还没有这个键）时是 undefined，
        // 另外「版本字段缺失」的 blob 根本不进 migrate、会原样落到这里 ——
        // normalizeResumeState 是这两条路的共同防线。
        const { byUser, activeByUser } = normalizeResumeState(persistedState);
        const currentUserId = useCareerProfileStore.getState().currentUserId;
        const resumes = (currentUserId ? byUser[currentUserId] : undefined) ?? {};
        const activeResumeId = (currentUserId ? activeByUser[currentUserId] : null) ?? null;

        return {
          ...currentState,
          byUser,
          activeByUser,
          resumes,
          activeResumeId,
          activeResume: activeResumeId ? resumes[activeResumeId] ?? null : null,
        };
      },
    }
  )
);

/**
 * 当前用户一变，就把那个用户的简历切片装进别名。
 *
 * 为什么用模块级订阅而不是让每个切人入口自己记得调：切人有两个入口
 * （`UserSelectDialog` 的选卡与新建），将来还可能有第三个 —— 订阅让「忘记
 * 同步」在结构上不可能发生。这是 `useResumeStore` 对 `useCareerProfileStore`
 * 的唯一一处依赖，单向、无环（档案 store 不反向依赖简历 store），是
 * `docs/02-data-model.md` §7.2「三个 store 互不 import」的一处刻意例外。
 */
useCareerProfileStore.subscribe((state, prev) => {
  if (state.currentUserId !== prev.currentUserId) {
    useResumeStore.getState().setActiveUser(state.currentUserId);
  }
});
