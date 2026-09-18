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

/**
 * 同一个案例跑多次时，把指标按次平均。
 *
 * 模型自身的抖动（实测重跑翻转率 7%~11%）会让单次运行的数字失去意义 ——
 * 噪声比要看的效果还大。取均值后，差异才归因得到 prompt 而不是这一次的运气。
 * 失败明细保留首次运行的，便于逐条复查。
 */
export const averageCaseMetrics = (runs: CaseMetrics[]): CaseMetrics => {
  if (runs.length <= 1) return runs[0];

  const first = runs[0];
  const avgOf = <T extends object>(pick: (m: CaseMetrics) => T): T => {
    const out = { ...pick(first) } as Record<string, unknown>;
    for (const key of Object.keys(out)) {
      if (typeof out[key] !== "number") continue;
      out[key] = mean(runs.map((r) => (pick(r) as Record<string, number>)[key]));
    }
    return out as T;
  };

  return {
    caseId: first.caseId,
    dimensions: first.dimensions,
    judgment: avgOf((m) => m.judgment),
    coverage: avgOf((m) => m.coverage),
    ranking: avgOf((m) => m.ranking),
    selection: avgOf((m) => m.selection),
  };
};

export const aggregateMetrics = (
  cases: CaseMetrics[],
  stability: StabilityMetrics | null
): AggregateMetrics => {
  // ── 判定类：合并混淆矩阵后重算 ──
  const hallucinationCount = cases.reduce((s, c) => s + c.judgment.hallucinations.length, 0);
  const reasonCount = cases.reduce(
    (s, c) => s + c.judgment.truePositive + c.judgment.falseNegative + c.judgment.falsePositive + c.judgment.trueNegative,
    0
  );

  // ── 其余：按案例平均 ──
  const avg = (pick: (c: CaseMetrics) => number) => mean(cases.map(pick));

  const values: Partial<Record<MetricKey, number>> = {
    missingRecall: avg((c) => c.coverage.missingRecall),
    coverageFalsePositive: avg((c) => c.coverage.coverageFalsePositive),

    // 下面三项**不再采集**：v4 起模型只输出排序，不再输出「推荐/不推荐」
    // 这个二分标签（划线取决于用户这份简历放得下几条，模型无从知道）。
    // 判定类的混淆矩阵因此失去测量对象 —— 它衡量的是模型没做的那个决定。
    // 同一件事由排序与筛选两组的指标承担：NDCG@5 / 理想集合重合度 / 选择质量。
    // 对照实现：computeJudgmentMetrics 仍返回这些数，需要时可自行取用。

    reasonHallucinationRate: reasonCount === 0 ? 0 : hallucinationCount / reasonCount,

    ndcgAt5: avg((c) => c.ranking.ndcgAt5),
    spearman: avg((c) => c.ranking.spearman),
    top5HitRate: avg((c) => c.ranking.top5HitRate),

    mustHaveRecall: avg((c) => c.selection.mustHaveRecall),
    idealJaccard: avg((c) => c.selection.idealJaccard),
    selectionQuality: avg((c) => c.selection.selectionQuality),
  };

  if (stability?.l1Checked) values.l1Drift = stability.l1Drift;
  // 只报排序一致性：v4 起「重跑翻转率」比的是由排名推出的 level，
  // 粒度反而比肯德尔 τ 粗，留着是同一件事的两个说法
  if (stability && stability.runCount > 1) {
    values.rankKendallTau = stability.rankKendallTau;
  }
  if (stability?.perturbationChecked) values.perturbationFlipRate = stability.perturbationFlipRate;

  return { values, perCase: cases.map((metrics) => ({ caseId: metrics.caseId, metrics })), stability };
};

export { computeStabilityMetrics };
export type { StabilityMetrics };
