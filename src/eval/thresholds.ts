import type { MetricKey, Threshold } from "./types";

/**
 * 阈值表。
 *
 * 没有阈值的指标只是数字堆砌 —— 看完成绩单得不出「这版能不能用」。
 * 每条都给出理由，因为阈值是判断，不是事实，得能被质疑。
 */
export const THRESHOLDS: Record<MetricKey, Threshold & { rationale: string }> = {
  // ── JD 理解 ──
  requirementRecall: {
    // 阈值在第一次测量**之前**定下：十条任职要求里漏一条已是上限。
    // 判据是这条指标的用途 —— 用户靠这份清单判断自己缺什么，
    // 漏掉一条硬性要求会让他以为自己够格去投、白跑一趟。
    value: 0.9,
    direction: "higher",
    label: "要求项召回",
    rationale: "JD 的任职要求抽漏一条，用户就看不到自己缺什么 —— 十条里漏一条已是上限",
  },
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
  // 注意：判定类的混淆矩阵（漏判/误判/证据自洽）**不在此表内**。
  // v4 起模型只输出排序，不再输出二分标签 —— 那三项衡量的是模型没做的决定。
  // 见 docs/07-eval-design.md §3 的说明。
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
    // 阈值 0.90，**事后修订**：初版定的是 1.0，理由栏写的却只是「按相关度满分算」——
    // 那是复述定义，不是理由。看数据前定的，看数据后才补上真正的判据：
    // 在同样多的名额里，至少拿到可用相关度的九成。
    value: 0.9,
    direction: "higher",
    label: "选择质量",
    rationale: "同样名额下至少拿到九成可用相关度；剩下的差额由用户在编辑器里补",
  },

  // ── 稳定性 ──
  l1Drift: {
    value: 0,
    direction: "lower",
    label: "L1 缓存漂移",
    rationale: "缓存命中根本不发请求，不为 0 说明缓存坏了，与模型无关",
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
