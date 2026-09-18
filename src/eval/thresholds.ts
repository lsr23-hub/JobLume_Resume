import type { MetricKey, Threshold } from "./types";

/**
 * 阈值表。
 *
 * 没有阈值的指标只是数字堆砌 —— 看完成绩单得不出「这版能不能用」。
 * 每条都给出理由，因为阈值是判断，不是事实，得能被质疑。
 */
export const THRESHOLDS: Record<MetricKey, Threshold & { rationale: string }> = {
  // ── JD 理解 ──
  missingRecall: {
    value: 0.8,
    direction: "higher",
    label: "缺失项召回",
    rationale: "漏掉一条硬性要求，用户会以为自己够格去投，白跑一趟",
  },
  coverageFalsePositive: {
    value: 0.1,
    direction: "lower",
    label: "覆盖虚报率",
    rationale: "虚报覆盖比漏报更误导 —— 用户会以为自己已经具备了",
  },

  // ── 匹配判定 ──
  falseNegativeRate: {
    value: 0.1,
    direction: "lower",
    label: "漏判率",
    rationale: "误判用户看一眼就删了；漏判用户根本不知道自己漏了",
  },
  falsePositiveRate: {
    value: 0.25,
    direction: "lower",
    label: "误判率",
    rationale: "比漏判宽松 —— 代价只是用户多删一条",
  },
  evidenceSelfConsistency: {
    value: 0.95,
    direction: "higher",
    label: "证据自洽率",
    rationale: "引不出原文依据的否定判断，系统会自动推翻，等于白判",
  },
  reasonHallucinationRate: {
    value: 0.05,
    direction: "lower",
    label: "理由幻觉率",
    rationale: "编造原文没有的技术名词或数字，用户会当成真的",
  },

  // ── 排序 ──
  ndcgAt5: {
    value: 0.8,
    direction: "higher",
    label: "NDCG@5",
    rationale: "HR 只看前几条，顺序错了等于没排",
  },
  spearman: {
    value: 0.6,
    direction: "higher",
    label: "斯皮尔曼相关",
    rationale: "只要求方向一致，不要求完全一致",
  },
  top5HitRate: {
    value: 0.6,
    direction: "higher",
    label: "top-5 命中率",
    rationale: "五个里至少对上三个",
  },

  // ── 筛选与成品 ──
  mustHaveRecall: {
    value: 1,
    direction: "higher",
    label: "关键经历召回",
    rationale: "漏掉一条决定性经历，这份简历就废了 —— 这里不接受任何折扣",
  },
  idealJaccard: {
    value: 0.7,
    direction: "higher",
    label: "理想集合重合度",
    rationale: "允许措辞层面的人机分歧，但大头要对上",
  },
  selectionQuality: {
    value: 1,
    direction: "higher",
    label: "选择质量",
    rationale: "理想集合按相关度满分算",
  },

  // ── 稳定性 ──
  l1Drift: {
    value: 0,
    direction: "lower",
    label: "L1 缓存漂移",
    rationale: "缓存命中根本不发请求，不为 0 说明缓存坏了，与模型无关",
  },
  rerunFlipRate: {
    value: 0.05,
    direction: "lower",
    label: "重跑翻转率",
    rationale: "用户明确要求过「不要每次结果相差很远」",
  },
  rankKendallTau: {
    value: 0.8,
    direction: "higher",
    label: "排序一致性",
    rationale: "顺序抖动比判定抖动更常见，也更容易被用户察觉",
  },
  perturbationFlipRate: {
    value: 0.1,
    direction: "lower",
    label: "扰动翻转率",
    rationale: "JD 换个行、换个标点就变结论，说明模型在抓表面特征",
  },
};

export interface MetricVerdict {
  key: MetricKey;
  label: string;
  value: number;
  threshold: number;
  pass: boolean;
}

export const evaluateMetric = (key: MetricKey, value: number): MetricVerdict => {
  const t = THRESHOLDS[key];
  const pass = t.direction === "higher" ? value >= t.value : value <= t.value;
  return { key, label: t.label, value, threshold: t.value, pass };
};

export const evaluateAll = (
  values: Partial<Record<MetricKey, number>>
): MetricVerdict[] =>
  (Object.keys(values) as MetricKey[]).map((key) => evaluateMetric(key, values[key] as number));
