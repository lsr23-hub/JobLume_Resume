import type { MatchAnalysis } from "@/types/jobTarget";
import type { CaseRun } from "../types";

/**
 * 稳定性与可复现性指标。
 *
 * 用户明确要求过「可复现性必须相对较高，不要每次匹配结果相差很远」，
 * 所以这组指标和正确性同等重要 —— 一个准确但每次不同的系统没法用。
 *
 * 分两层（docs/03 §4.7）：
 * - **L1 缓存命中**：数据没变就重跑。指纹缓存直接复用上次结果，不发请求，
 *   所以漂移必须是 0。不为 0 说明缓存坏了，不是模型的问题。
 * - **L2 重新调用**：同一份输入真的再调一次模型。这才是模型自身的抖动。
 */

export interface StabilityMetrics {
  /** L1：缓存命中时判定发生变化的条数。必须为 0 */
  l1Drift: number;
  l1Checked: boolean;

  /** L2：多次重跑之间判定不一致的条目比例 */
  rerunFlipRate: number;
  /** 跑了几次（含首次）。少于 2 次时上面两项无意义 */
  runCount: number;

  /** 多次重跑排序的平均肯德尔相关系数 */
  rankKendallTau: number;

  /** 扰动后判定翻转率（JD 做语义等价改写） */
  perturbationFlipRate: number;
  perturbationChecked: boolean;
}

/** 判定不一致的条目 id —— 只比二值结论，不比理由措辞 */
export const judgmentDiff = (
  a: MatchAnalysis | null,
  b: MatchAnalysis | null
): string[] => {
  const ids = new Set([
    ...Object.keys(a?.items ?? {}),
    ...Object.keys(b?.items ?? {}),
  ]);

  return Array.from(ids).filter(
    (id) => (a?.items[id]?.level ?? "not_recommended") !== (b?.items[id]?.level ?? "not_recommended")
  );
};

/** 平均秩版本的肯德尔 τ（b）。两序列的公共项少于 2 时无定义，返回 1 */
export const kendallTau = (a: string[], b: string[]): number => {
  const common = a.filter((id) => b.includes(id));
  const n = common.length;
  if (n < 2) return 1;

  const rankA = new Map(common.map((id, index) => [id, a.indexOf(id)]));
  const rankB = new Map(common.map((id, index) => [id, b.indexOf(id)]));

  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const da = (rankA.get(common[i]) as number) - (rankA.get(common[j]) as number);
      const db = (rankB.get(common[i]) as number) - (rankB.get(common[j]) as number);
      const product = da * db;
      if (product > 0) concordant += 1;
      else if (product < 0) discordant += 1;
    }
  }

  const total = concordant + discordant;
  return total === 0 ? 1 : (concordant - discordant) / total;
};

const mean = (values: number[]): number =>
  values.length === 0 ? 1 : values.reduce((s, x) => s + x, 0) / values.length;

export interface StabilityInput {
  /** 首次运行，以及 N 次重跑（第 0 个是首次） */
  runs: CaseRun[];
  /** 缓存命中那次的结果，用于 L1 检查 */
  cachedRun?: CaseRun | null;
  /** 扰动后的运行 */
  perturbedRun?: CaseRun | null;
}

export const computeStabilityMetrics = ({
  runs,
  cachedRun,
  perturbedRun,
}: StabilityInput): StabilityMetrics => {
  const first = runs[0]?.analysis ?? null;

  const reruns = runs.slice(1);
  const rerunFlipRate =
    reruns.length === 0 || !first
      ? 0
      : mean(
          reruns.map(
            (run) => judgmentDiff(first, run.analysis).length /
              Math.max(1, Object.keys(first.items).length)
          )
        );

  const rankKendallTau =
    reruns.length === 0 || !first
      ? 1
      : mean(
          reruns.map((run) => kendallTau(first.rankedIds, run.analysis?.rankedIds ?? []))
        );

  const perturbationFlipRate =
    !perturbedRun || !first
      ? 0
      : judgmentDiff(first, perturbedRun.analysis).length /
        Math.max(1, Object.keys(first.items).length);

  return {
    l1Drift: cachedRun && first ? judgmentDiff(first, cachedRun.analysis).length : 0,
    l1Checked: Boolean(cachedRun),
    rerunFlipRate,
    runCount: runs.length,
    rankKendallTau,
    perturbationFlipRate,
    perturbationChecked: Boolean(perturbedRun),
  };
};
