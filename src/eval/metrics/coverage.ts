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

/** 最长公共子串的长度。技能名都很短，朴素 DP 足够 */
const longestCommonRun = (a: string, b: string): number => {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      diagonal = tmp;
      if (prev[j] > best) best = prev[j];
    }
  }
  return best;
};

/** 去掉分隔符后剩下的拉丁/数字词 */
const latinTokens = (text: string): string[] =>
  text.match(/[a-z][a-z0-9+#.]*/g) ?? [];

/**
 * 两个技能描述是否指同一件事。
 *
 * 人工标注写的是复合长句（「复杂数据可视化经验（Canvas/WebGL/图表库）」），
 * 模型给的是原子术语（「图表库实战」）—— 逐字比对认不出是同一个缺口，
 * 实测把召回压到 32.6%，而模型其实答对了。
 *
 * 三层，从严到宽：
 * 1. 归一化后相等或一方包含另一方
 * 2. 最长公共子串 ≥ 3 字
 * 3. 共享一个长度 ≥ 2 的拉丁词（Java、A/B、K8s）
 *
 * 门槛卡在「不能把 JD 的干扰项也算对」上：fin-04 实测模型把
 * 「中共党员 / 驾照 / 篮球特长」当成档案缺失的技能，这些与
 * 「实时流计算」没有任何 3 字公共子串，必须判为不匹配。
 */
const isMatch = (a: string, b: string): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  if (longestCommonRun(na, nb) >= 3) return true;

  const la = latinTokens(na);
  const lb = new Set(latinTokens(nb));
  return la.some((t) => t.length >= 2 && lb.has(t));
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
