import type { CaseMetrics, MetricKey } from "../types";
import { computeStabilityMetrics, type StabilityMetrics } from "./stability";

/**
 * 跨案例汇总。
 *
 * 判定类**按原始计数汇总**而不是平均各案例的比率 —— 案例的条目数差很多，
 * 平均比率会让只有 3 条经历的案例和 20 条的案例等权，把结果带偏。
 * 其余指标按案例平均。
 */

export interface AggregateMetrics {
  /** 每个指标的跨案例值 */
  values: Partial<Record<MetricKey, number>>;
  /** 每个指标的分案例明细，用于看方差 */
  perCase: Array<{ caseId: string; metrics: CaseMetrics }>;
  stability: StabilityMetrics | null;
}

const mean = (values: number[]): number =>
  values.length === 0 ? 1 : values.reduce((s, x) => s + x, 0) / values.length;

export const aggregateMetrics = (
  cases: CaseMetrics[],
  stability: StabilityMetrics | null
): AggregateMetrics => {
  // ── 判定类：合并混淆矩阵后重算 ──
  const tp = cases.reduce((s, c) => s + c.judgment.truePositive, 0);
  const fn = cases.reduce((s, c) => s + c.judgment.falseNegative, 0);
  const fp = cases.reduce((s, c) => s + c.judgment.falsePositive, 0);
  const tn = cases.reduce((s, c) => s + c.judgment.trueNegative, 0);

  const hallucinationCount = cases.reduce((s, c) => s + c.judgment.hallucinations.length, 0);
  const reasonCount = cases.reduce(
    (s, c) => s + c.judgment.truePositive + c.judgment.falseNegative + c.judgment.falsePositive + c.judgment.trueNegative,
    0
  );
  const autoPromoted = cases.reduce((s, c) => s + c.judgment.autoPromotedCount, 0);
  const notRecommended = cases.reduce((s, c) => s + c.judgment.notRecommendedCount, 0);

  // ── 其余：按案例平均 ──
  const avg = (pick: (c: CaseMetrics) => number) => mean(cases.map(pick));

  const values: Partial<Record<MetricKey, number>> = {
    missingRecall: avg((c) => c.coverage.missingRecall),
    coverageFalsePositive: avg((c) => c.coverage.coverageFalsePositive),

    falseNegativeRate: fn + tp === 0 ? 0 : fn / (fn + tp),
    falsePositiveRate: fp + tn === 0 ? 0 : fp / (fp + tn),
    evidenceSelfConsistency: notRecommended === 0 ? 1 : 1 - autoPromoted / notRecommended,
    reasonHallucinationRate: reasonCount === 0 ? 0 : hallucinationCount / reasonCount,

    ndcgAt5: avg((c) => c.ranking.ndcgAt5),
    spearman: avg((c) => c.ranking.spearman),
    top5HitRate: avg((c) => c.ranking.top5HitRate),

    mustHaveRecall: avg((c) => c.selection.mustHaveRecall),
    idealJaccard: avg((c) => c.selection.idealJaccard),
    selectionQuality: avg((c) => c.selection.selectionQuality),
  };

  if (stability?.l1Checked) values.l1Drift = stability.l1Drift;
  if (stability && stability.runCount > 1) {
    values.rerunFlipRate = stability.rerunFlipRate;
    values.rankKendallTau = stability.rankKendallTau;
  }
  if (stability?.perturbationChecked) values.perturbationFlipRate = stability.perturbationFlipRate;

  return { values, perCase: cases.map((metrics) => ({ caseId: metrics.caseId, metrics })), stability };
};

export { computeStabilityMetrics };
export type { StabilityMetrics };
