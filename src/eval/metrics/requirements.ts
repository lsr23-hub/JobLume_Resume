import type { MatchAnalysis } from "@/types/jobTarget";
import { requirementsOf } from "@/lib/match/validateMatchResult";
import type { GoldRequirement } from "../types";
import { isSameSkill } from "./skillMatch";

/**
 * 要求项召回。
 *
 * 这是 P7 的核心指标（docs/06）：**模型有没有把 JD 的要求读全**。
 * 漏掉一条硬性要求，用户就看不到自己缺什么，会以为自己够格去投、白跑一趟 ——
 * 与「把不存在的要求说成缺失」是同一个伤害的两面。
 *
 * 只评**抽取**，不评覆盖判定。给每条要求判断「档案够不够」需要逐条对照
 * 档案做判断题，那是另一轮的工作量，而且做的时候极容易被模型输出污染 ——
 * 先有干净的要求项金标准，再谈状态准确率。
 *
 * 比对用 `isSameSkill`（与缺失项召回同一个匹配器，它的已知边界也一样）：
 * 人工写的是短句、模型可能写成整句，逐字比对认不出。模型侧的比对对象是
 * **要求正文 + 原子词**，任一命中即算抽出。
 */

export interface RequirementMetrics {
  /** 模型一共抽出多少条要求 —— 用来发现「只抽了两条就交差」 */
  extracted: number;

  /** 人工标注的任职要求（must + nice）被抽出的比例 */
  requirementRecall: number;
  found: string[];
  missed: string[];

  /**
   * 只看硬性要求的召回。
   *
   * 单独报是因为它与整体召回的含义不同：加分项漏了只是少一个亮点，
   * 硬性要求漏了会让用户误判要不要投。
   */
  mustRecall: number;
  mustMissed: string[];
}

const matchesAny = (gold: string, candidates: string[]): boolean =>
  candidates.some((candidate) => isSameSkill(gold, candidate));

export const computeRequirementMetrics = (
  analysis: MatchAnalysis | null,
  goldRequirements: GoldRequirement[]
): RequirementMetrics => {
  const extracted = requirementsOf(analysis);
  const modelTexts = extracted.flatMap((requirement) => [requirement.text, ...requirement.keys]);

  // 职责（duty）不计入召回：金标准里那份是我对 JD 职责的概括，粒度比任职要求粗，
  // 拿它算召回测出来的主要是切分差异，不是抽取质量
  const scorable = goldRequirements.filter((requirement) => requirement.kind !== "duty");
  const found = scorable.filter((r) => matchesAny(r.text, modelTexts)).map((r) => r.text);
  const missed = scorable.filter((r) => !matchesAny(r.text, modelTexts)).map((r) => r.text);

  const musts = goldRequirements.filter((requirement) => requirement.kind === "must");
  const mustMissed = musts
    .filter((r) => !matchesAny(r.text, modelTexts))
    .map((r) => r.text);

  return {
    extracted: extracted.length,
    requirementRecall: scorable.length === 0 ? 1 : found.length / scorable.length,
    found,
    missed,
    mustRecall: musts.length === 0 ? 1 : (musts.length - mustMissed.length) / musts.length,
    mustMissed,
  };
};
