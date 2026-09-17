import { useCallback } from "react";

import {
  entityToCustomItem,
  entityToEducation,
  entityToExperience,
  entityToProject,
} from "@/lib/profile/toResumeItem";
import { useResumeStore } from "@/store/useResumeStore";
import type { ProfileEntity } from "@/types/profile";
import { useEnsureSectionEnabled } from "./useEnsureSectionEnabled";

/**
 * 把职业数据库的条目加进当前简历的某个板块。
 *
 * 板块决定字段映射（教育经历要拆起止时间、项目经历多两个链接字段），
 * 映射本身由 `@/lib/profile/toResumeItem` 提供 —— 与生成简历时用的是同一套，
 * 免得同一条经历因入口不同而长得不一样。
 *
 * **单向**：写的是简历，不碰职业数据库。
 */
export const useAddSectionEntities = () => {
  const ensureEnabled = useEnsureSectionEnabled();

  return useCallback(
    (sectionId: string, entities: ProfileEntity[]) => {
      if (entities.length === 0) return;

      // 从 store 现取，避免闭包拿到过期的简历
      const store = useResumeStore.getState();
      const resume = store.activeResume;
      if (!resume) return;

      if (sectionId === "education") {
        store.updateEducationBatch([
          ...(resume.education ?? []),
          ...entities.map(entityToEducation),
        ]);
      } else if (sectionId === "experience") {
        store.updateExperienceBatch([
          ...(resume.experience ?? []),
          ...entities.map(entityToExperience),
        ]);
      } else if (sectionId === "projects") {
        store.updateProjectsBatch([
          ...(resume.projects ?? []),
          ...entities.map(entityToProject),
        ]);
      } else {
        store.updateCustomData(sectionId, [
          ...(resume.customData?.[sectionId] ?? []),
          ...entities.map(entityToCustomItem),
        ]);
      }

      ensureEnabled(sectionId);
    },
    [ensureEnabled]
  );
};
