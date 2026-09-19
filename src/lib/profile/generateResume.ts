import type { CareerProfile } from "@/types/profile";
import type { JobTarget } from "@/types/jobTarget";
import type { MenuSection, ResumeData } from "@/types/resume";
import { DEFAULT_TEMPLATES } from "@/config";
import { SECTION_DEFS } from "@/config/sections";
import { materialize } from "./materialize";

/**
 * 从职业数据库生成一份简历。
 *
 * 三处调用方共用（投递目标页、简历工作台、新建向导的模板适配）——
 * 这些逻辑原本每个调用方各抄了一份，且都漏了「应用所选模板的排版参数」，
 * 生成出来永远是默认样式。集中到这里就不会再漏。
 */

export type GenerateMode = "generic" | "targeted";

export interface GenerateResumeInput {
  profile: CareerProfile;
  mode: GenerateMode;

  /** 岗位专用简历必传；通用简历为 null */
  target?: JobTarget | null;

  templateId: string;

  /** 运行时元信息由调用方提供，保持本函数可测 */
  id: string;
  title: string;
  now: string;

  /** 各板块选中的条目 id —— 「用户勾选」的唯一表达 */
  selection: Record<string, string[]>;

  /**
   * 用户主动关掉的板块。不传表示全部按内容自动判定。
   * 只有带勾选界面的调用方会传。
   */
  disabledSections?: Set<string>;

  /**
   * 板块标题翻译器。`materialize` 是纯函数不读 i18n，
   * 由调用方传 `useTranslations("profile")` 的 `t` 进来。
   */
  tSection: (key: string) => string;

  /**
   * 证书那一行的标签，如「证书奖项」。
   *
   * 必填而非可选 —— 漏传会让证书静默消失，这种失败方式太难排查。
   */
  certificateLabel: string;

  /**
   * 在投递目标页被手动改过勾选状态的条目 id。
   *
   * 由调用方给 —— 描述的是「用户在投递目标页的干预」，只有那条路径知道。
   * 向导是全选，不产生这个语义，留空即可。
   */
  manuallyAdjustedIds?: string[];
}

/**
 * 数据库里有没有可用的内容。
 *
 * 新建向导用它拦在第一步 —— 空库生成出来是一份除了姓名什么都不剩的简历，
 * 与其让用户走完三步再拿到一份空壳，不如一开始就说清楚。
 */
export const hasUsableProfile = (profile: CareerProfile | null): boolean => {
  if (!profile) return false;
  return Boolean(
    profile.basic?.name?.trim() ||
      Object.keys(profile.entities ?? {}).length > 0 ||
      (profile.skillGroups ?? []).length > 0 ||
      (profile.certificateText ?? "").trim() ||
      (profile.selfEvaluationContent ?? "").trim()
  );
};

/** 把数据库里的可见条目按板块归类 —— 即「全都收进简历」的 selection */
export const selectAllEntities = (
  profile: CareerProfile
): Record<string, string[]> => {
  const bySection: Record<string, string[]> = {};
  for (const entity of Object.values(profile.entities)) {
    if (entity.hidden) continue;
    (bySection[entity.sectionId] ??= []).push(entity.id);
  }
  return bySection;
};

export const generateResume = (input: GenerateResumeInput): ResumeData => {
  const {
    profile,
    mode,
    target,
    templateId,
    id,
    title,
    now,
    selection,
    disabledSections = new Set<string>(),
    tSection,
    certificateLabel,
    manuallyAdjustedIds = [],
  } = input;

  // 必备板块锁定开启；但完全没有内容的板块不渲染 —— 否则模板会输出一个
  // 只有标题、下面空无一物的板块
  const hasContent = (sectionId: string): boolean => {
    if (sectionId === "basic") return true;
    if (sectionId === "skills") {
      // 必须与 renderSkillContent 的过滤条件一致 —— 它跳过的是 content 为空的组，
      // 只看 length 会让「有组名没内容」的组撑出一个空标题
      // 证书现在住在技能板块里，所以也要算进来
      return (
        profile.skillGroups.some((g) => g.content.trim()) ||
        (profile.certificateText ?? "").trim() !== ""
      );
    }
    if (sectionId === "selfEvaluation") {
      return profile.selfEvaluationContent.trim() !== "";
    }
    return (selection[sectionId]?.length ?? 0) > 0;
  };

  const sections: MenuSection[] = SECTION_DEFS.map((def, index) => ({
    id: def.id,
    title: tSection(def.titleKey),
    icon: def.icon,
    enabled: (def.required || !disabledSections.has(def.id)) && hasContent(def.id),
    order: index,
  }));

  const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);

  const resume = materialize({
    profile,
    selection,
    sections,
    meta: { id, title, now, templateId },
    // AI 的优先级序列 —— 板块内部按「与岗位的相关度」排，最相关的在最前。
    // 通用简历没有投递目标，也就没有序列，`materialize` 会退回数据库里的排列顺序
    priorityOrder: target?.matchAnalysis?.rankedIds,
    globalSettings: {
      // 「一页为最佳」是需求本身，所以默认开启自动缩放。
      // 上游默认是关的（`DEFAULT_GLOBAL_SETTINGS` 里根本没有这个键），
      // 不显式打开的话，页数取舍的第 1 步（不改内容、只缩排版）永远不会发生
      autoOnePage: true,
      ...(template
        ? {
            themeColor: template.colorScheme.primary,
            sectionSpacing: template.spacing.sectionGap,
            paragraphSpacing: template.spacing.itemGap,
            pagePadding: template.spacing.contentPadding,
          }
        : {}),
    },
    certificateLabel,
    snapshot:
      mode === "targeted" && target
        ? {
            mode: "targeted",
            jobTargetId: target.id,
            jdSnapshot: target.jdRaw,
            matchAnalysisSnapshot: target.matchAnalysis ?? undefined,
            selectedEntityIds: selection,
            manuallyAdjustedIds,
            generatedAt: now,
          }
        : { mode: "generic", jobTargetId: null, generatedAt: now },
  });

  // 模板的姓名区布局不属于 globalSettings，materialize 也读不到，单独覆盖
  const layout = template?.basic.layout;
  return layout ? { ...resume, basic: { ...resume.basic, layout } } : resume;
};
