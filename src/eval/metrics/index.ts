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
  /** 覆盖类指标的分母：有标注的案例数 / 总案例数 */
  annotatedCases: { missing: number; unsupported: number; mustHave: number; total: number };
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
    requirements: avgOf((m) => m.requirements),
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

  /**
   * 只在**有标注的案例**上平均。
   *
   * 覆盖类指标原先跟其他指标一样对全部案例取平均，但没标注的案例在
   * `computeCoverageMetrics` 里返回的是「满分」—— `missingRecall` 返 1、
   * `coverageFalsePositive` 返 0（越低越好）。于是**标注越少、指标越好看**：
   * 全数据集只有十几条标注时，这个稀释足以把结论带反。
   *
   * `mustHaveRecall` 有同一个毛病（`selection.ts` 在 `mustHaveIds.length === 0`
   * 时返 1）。实测 8 个案例里 `jun-02` 一条 must-have 都没标，
   * 它给 89.6% 这个数字贡献了一个假的满分。
   *
   * 没有任何合格案例时返回 `undefined` 而不是满分 —— 报告会把它渲染成
   * 「未采集」。「没测」和「测了满分」必须能分开，否则尺子会撒谎。
   */
  const avgAnnotated = (
    hasAnnotation: (c: CaseMetrics) => boolean,
    pick: (c: CaseMetrics) => number
  ): number | undefined => {
    const annotated = cases.filter(hasAnnotation);
    return annotated.length === 0 ? undefined : mean(annotated.map(pick));
  };

  const values: Partial<Record<MetricKey, number>> = {
    requirementRecall: avg((c) => c.requirements.requirementRecall),
    missingRecall: avgAnnotated((c) => c.coverage.missingTotal > 0, (c) => c.coverage.missingRecall),
    coverageFalsePositive: avgAnnotated(
      (c) => c.coverage.unsupportedTotal > 0,
      (c) => c.coverage.coverageFalsePositive
    ),

    // 下面三项**不再采集**：v4 起模型只输出排序，不再输出「推荐/不推荐」
    // 这个二分标签（划线取决于用户这份简历放得下几条，模型无从知道）。
    // 判定类的混淆矩阵因此失去测量对象 —— 它衡量的是模型没做的那个决定。
    // 同一件事由排序与筛选两组的指标承担：NDCG@5 / 理想集合重合度 / 选择质量。
    // 对照实现：computeJudgmentMetrics 仍返回这些数，需要时可自行取用。

    reasonHallucinationRate: reasonCount === 0 ? 0 : hallucinationCount / reasonCount,

    ndcgAt5: avg((c) => c.ranking.ndcgAt5),
    spearman: avg((c) => c.ranking.spearman),
    top5HitRate: avg((c) => c.ranking.top5HitRate),

    mustHaveRecall: avgAnnotated((c) => c.selection.mustHaveTotal > 0, (c) => c.selection.mustHaveRecall),
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

  return {
    values,
    perCase: cases.map((metrics) => ({ caseId: metrics.caseId, metrics })),
    stability,
    // 覆盖类指标的**分母**：多少案例真有标注。比率必须和它一起读 ——
    // 全数据集只有十几条标注时，单看百分比会把一把粗尺子读成精确结论。
    annotatedCases: {
      missing: cases.filter((c) => c.coverage.missingTotal > 0).length,
      unsupported: cases.filter((c) => c.coverage.unsupportedTotal > 0).length,
      mustHave: cases.filter((c) => c.selection.mustHaveTotal > 0).length,
      total: cases.length,
    },
  };
};

export { computeStabilityMetrics };
export type { StabilityMetrics };
