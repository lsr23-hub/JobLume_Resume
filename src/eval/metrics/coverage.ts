import type { MatchAnalysis } from "@/types/jobTarget";

/**
 * JD 理解指标。
 *
 * 当前 prompt 让模型一口气给出 `coverage: {covered, weak, missing}`，不产出
 * 结构化的要求清单 —— 所以这里评的是**模型对 JD 要求的覆盖判断准不准**，
 * 而不是「要求项提取的召回率」（那需要先改 prompt，见 docs/06 P7）。
 *
 * 优先看缺失项召回：漏一条硬性要求，用户会以为自己够格去投，白跑一趟。
 */

export interface CoverageMetrics {
  /** 人工标注「JD 要求但档案没支撑」的技能，被 coverage.missing 找出的比例 */
  missingRecall: number;
  missingFound: string[];
  missingMissed: string[];

  /** covered 里人工认为其实没支撑的比例 —— 虚报覆盖比漏报更误导 */
  coverageFalsePositive: number;
  unsupportedClaimed: string[];

  coveredCount: number;
  weakCount: number;
  missingCount: number;
}

/** 归一化：小写、去空白与常见标点，让「Python 」和「python」算同一条 */
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\s·、,，;；/|（）()【】\[\]]/g, "")
    .trim();

/**
 * 中文技能名常有包含关系（「机器学习」⊂「机器学习框架」），
 * 用双向包含代替精确相等，避免因措辞不同判成没找到。
 */
const isMatch = (a: string, b: string): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

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
    missing.some((m) => isMatch(m, skill))
  );
  const missingMissed = missingSkills.filter(
    (skill) => !missing.some((m) => isMatch(m, skill))
  );

  // 人工点名「不该出现在 covered 里」的技能，实际出现了多少
  const unsupportedClaimed = unsupportedSkills.filter((skill) =>
    covered.some((c) => isMatch(c, skill))
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
    coveredCount: covered.length,
    weakCount: weak.length,
    missingCount: missing.length,
  };
};
