import { useCallback, useState } from "react";

import { DEFAULT_TEMPLATES } from "@/config";
import { generateResume, selectAllEntities } from "@/lib/profile/generateResume";
import { planFit, type FitPlan } from "@/lib/profile/pageBudget";
import { useResumeMeasurer } from "@/lib/profile/measureResume";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import type { ResumeKind } from "./CreateResumeWizard";

/** 量高用的占位 meta —— 标题与时间不参与模板排版，取固定值以免引入不确定输入 */
const DRAFT_ID = "measure-draft";
const DRAFT_NOW = "1970-01-01T00:00:00.000Z";

/** 移除顺序的依据是哪一种 —— 三种情况不能混为一谈 */
export type FitHintKey = "fitAiHint" | "fitNoAnalysisHint" | "fitPlainHint";

export interface FitPending {
  templateId: string;
  /** 未精简的全选集合 */
  selection: Record<string, string[]>;
  plan: FitPlan;
  hintKey: FitHintKey;
}

/**
 * 选完模板后的篇幅试算。
 *
 * 装得下就直接生成，装不下才多问一句（「该删哪几条」见 `planFit`）。
 * 测量失败一律按「全部内容」继续 —— 算不出页数不该挡住建简历。
 */
export const useTemplateFit = ({
  mode,
  targetId,
  onFits,
}: {
  mode: ResumeKind;
  targetId: string | null;
  /** 无需取舍（或测量失败）时直接生成 */
  onFits: (templateId: string, selection: Record<string, string[]>) => void;
}) => {
  const { profile } = useCareerProfileStore();
  const { targets } = useJobTargetStore();
  const tSection = useTranslations("profile");
  const { measure, host } = useResumeMeasurer();

  const [measuring, setMeasuring] = useState(false);
  const [pending, setPending] = useState<FitPending | null>(null);

  const reset = useCallback(() => {
    setPending(null);
    setMeasuring(false);
  }, []);

  /**
   * 量一版排布的高度。
   *
   * 用 `generateResume` 造一份草稿再量，而不是另写一套「拼数据」的代码 ——
   * 量的必须就是将要生成的那份，否则取舍依据是假的。
   */
  const measureSelection = useCallback((
    selection: Record<string, string[]>,
    templateId: string,
    scaleFactor: number
  ): Promise<number> => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    if (!profile || !template) return Promise.resolve(0);

    const draft = generateResume({
      profile,
      mode,
      target: targetId ? targets[targetId] ?? null : null,
      templateId,
      id: DRAFT_ID,
      title: "",
      now: DRAFT_NOW,
      selection,
      tSection,
      certificateLabel: tSection("certificatesLabel"),
      languageLabel: tSection("languageLabel"),
    });
    return measure(draft, template, scaleFactor);
  }, [profile, targets, targetId, mode, measure, tSection]);

  const pickTemplate = async (templateId: string) => {
    if (!profile) return;

    const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
    const selection = selectAllEntities(profile);
    if (!template) {
      onFits(templateId, selection);
      return;
    }

    setMeasuring(true);
    try {
      const analysis = (targetId ? targets[targetId]?.matchAnalysis : null) ?? null;
      // 有目标但没分析过 ≠ 没有目标：两者都退回数据库顺序，
      // 但原因不同 —— 说成「没有投递目标」会让用户以为选错了
      const hintKey: FitHintKey = analysis
        ? "fitAiHint"
        : targetId
          ? "fitNoAnalysisHint"
          : "fitPlainHint";

      const plan = await planFit({
        selection,
        entities: profile.entities,
        priorityOrder: analysis?.rankedIds,
        pagePadding: template.spacing.contentPadding,
        measure: (next, scaleFactor) => measureSelection(next, templateId, scaleFactor),
        reasons: analysis
          ? Object.fromEntries(
              Object.entries(analysis.items).map(([id, item]) => [id, item.reason])
            )
          : undefined,
      });

      if (plan.removed.length === 0) {
        onFits(templateId, selection);
        return;
      }

      setPending({ templateId, selection, plan, hintKey });
    } catch (error) {
      console.warn("[create-resume] 篇幅测量失败，按全部内容生成", error);
      onFits(templateId, selection);
    } finally {
      setMeasuring(false);
    }
  };

  /**
   * 只算不弹：给「内容选择」步量一份选择的篇幅。
   *
   * 与 `pickTemplate` 的区别是**不设 `pending`** —— 那条路径会把向导切到
   * 独立的「篇幅提议」步，而内容选择页要把结论就地显示在同一屏里。
   *
   * 复用同一个 `measure` 实例：再挂一个 `useResumeMeasurer` 会让两条探测链
   * 互相顶掉，而被顶掉的那次会 resolve 一个 **0**（见 `measureResume.tsx`），
   * `pagesOf` 把它 clamp 成 1 —— 读起来就是「一页装得下」，静默地骗人。
   */
  const measurePlan = useCallback(
    async (
      selection: Record<string, string[]>,
      templateId: string
    ): Promise<FitPlan | null> => {
      const template = DEFAULT_TEMPLATES.find((t) => t.id === templateId);
      if (!profile || !template) return null;
      const analysis = (targetId ? targets[targetId]?.matchAnalysis : null) ?? null;

      try {
        return await planFit({
          selection,
          entities: profile.entities,
          priorityOrder: analysis?.rankedIds,
          pagePadding: template.spacing.contentPadding,
          measure: (next, scaleFactor) => measureSelection(next, templateId, scaleFactor),
          reasons: analysis
            ? Object.fromEntries(
                Object.entries(analysis.items).map(([id, item]) => [id, item.reason])
              )
            : undefined,
        });
      } catch (error) {
        console.warn("[create-resume] 篇幅测算失败", error);
        return null;
      }
    },
    [profile, targets, targetId, measureSelection]
  );

  return { measuring, pending, pickTemplate, reset, measurePlan, measureHost: host };
};
