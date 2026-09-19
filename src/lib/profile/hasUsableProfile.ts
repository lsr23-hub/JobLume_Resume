import type { CareerProfile } from "@/types/profile";

/**
 * 这份档案里有没有「真东西」。
 *
 * 单独成文件是因为它有两个性质完全不同的调用方：
 * - `store/userScope.ts`（迁移判定空档案）—— 那是**叶子模块**，不能拖进
 *   模板/编辑器那一大片依赖图
 * - `resumes/CreateResumeWizard.tsx`（拦住空库生成）
 *
 * 之前定义在 `generateResume.ts` 里，而后者经 materialize 一路连到模板组件，
 * 于是 `userScope` 一 import 就把 `useResumeStore` 也拉了起来，在 store 还没
 * 建好时就求值 —— 环。这个文件只依赖类型，谁都能安全引。
 */
export const hasUsableProfile = (profile: CareerProfile | null): boolean => {
  if (!profile) return false;
  return Boolean(
    profile.basic?.name?.trim() ||
      Object.keys(profile.entities ?? {}).length > 0 ||
      (profile.skillGroups ?? []).length > 0 ||
      (profile.certificateText ?? "").trim() ||
      (profile.languageText ?? "").trim() ||
      (profile.selfEvaluationContent ?? "").trim()
  );
};
