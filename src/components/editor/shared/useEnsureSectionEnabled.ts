import { useCallback } from "react";

import { useResumeStore } from "@/store/useResumeStore";

/**
 * 往某个板块里加东西时，顺便把板块打开。
 *
 * 生成的简历里，没内容的板块 `enabled` 是 false —— 侧边栏仍然列出来（能点进去编辑），
 * 但模板不渲染它。往里面加了条目却不开这个开关，用户会觉得「加了没反应」。
 */
export const useEnsureSectionEnabled = () => {
  const updateMenuSections = useResumeStore((s) => s.updateMenuSections);

  return useCallback(
    (sectionId: string) => {
      // 从 store 现取而不是闭包里的：调用点分散在多个面板，闭包容易拿到旧值
      const { activeResume } = useResumeStore.getState();
      const sections = activeResume?.menuSections ?? [];
      if (sections.length === 0) return;
      if (sections.every((s) => s.id !== sectionId || s.enabled)) return;

      updateMenuSections(
        sections.map((s) => (s.id === sectionId ? { ...s, enabled: true } : s))
      );
    },
    [updateMenuSections]
  );
};
