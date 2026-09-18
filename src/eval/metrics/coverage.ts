import type { MatchAnalysis } from "@/types/jobTarget";
import { isSameSkill } from "./skillMatch";

/**
 * JD 理解指标。
 *
 * 当前 prompt 让模型一口气给出 `coverage: {covered, weak, missing}`，不产出
 * 结构化的要求清单 —— 所以这里评的是**模型对 JD 要求的覆盖判断准不准**，
 * 而不是「要求项提取的召回率」（那需要先改 prompt，见 docs/06 P7）。
 *
 * 优先看缺失项召回：漏一条硬性要求，用户会以为自己够格去投，白跑一趟。
 *
 * 「是不是同一个缺口」的判定在 `skillMatch.ts` —— 那里单独成文件是因为
 * 它是本套指标里唯一需要靠模糊匹配的地方，也最容易被悄悄放宽。
 */

export interface CoverageMetrics {
  /** 人工标注「JD 要求但档案没支撑」的技能，被 coverage.missing 找出的比例 */
  missingRecall: number;
  missingFound: string[];
  missingMissed: string[];

  /** covered 里人工认为其实没支撑的比例 —— 虚报覆盖比漏报更误导 */
  coverageFalsePositive: number;
  unsupportedClaimed: string[];

  /**
   * 人工标注的条数。**必须和比率一起看** ——
   * 全数据集只标了 4 条，一条就能让比率动 25 个百分点，
   * 单看比率会把这么粗的一把尺子读成精确结论。
   */
  missingTotal: number;
  unsupportedTotal: number;

  coveredCount: number;
  weakCount: number;
  missingCount: number;
}

export const computeCoverageMetrics = (
  analysis: MatchAnalysis | null,
  missingSkills: string[],
  unsupportedSkills: string[] = []
): CoverageMetrics => {
  const coverage = analysis?.summary.coverage;
  const covered = coverage?.covered ?? [];
  const weak = coverage?.weak ?? [];
  const missing = coverage?.missing ?? [];

  const missingFound = missingSkills.filter((skill) =>
    missing.some((m) => isSameSkill(m, skill))
  );
  const missingMissed = missingSkills.filter(
    (skill) => !missing.some((m) => isSameSkill(m, skill))
  );

  // 人工点名「不该出现在 covered 里」的技能，实际出现了多少
  const unsupportedClaimed = unsupportedSkills.filter((skill) =>
    covered.some((c) => isSameSkill(c, skill))
  );

  return {
    missingRecall:
      missingSkills.length === 0 ? 1 : missingFound.length / missingSkills.length,
    missingFound,
    missingMissed,
    coverageFalsePositive:
      unsupportedSkills.length === 0
        ? 0
        : unsupportedClaimed.length / unsupportedSkills.length,
    unsupportedClaimed,
    missingTotal: missingSkills.length,
    unsupportedTotal: unsupportedSkills.length,
    coveredCount: covered.length,
    weakCount: weak.length,
    missingCount: missing.length,
  };
};
