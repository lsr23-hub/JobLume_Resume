import type { ProfileEntity } from "@/types/profile";
import type { MatchAnalysis } from "@/types/jobTarget";
import type { GoldEntity } from "../types";

/**
 * 匹配判定指标（逐条目）。
 *
 * 立场：**漏判比误判严重**。误判用户看一眼就删掉了；漏判用户根本不知道自己漏了，
 * 会以为自己没有相关经历。所以漏判率与误判率分开报，阈值也差一倍以上。
 */

export interface FailedItem {
  id: string;
  title: string;
  goldReason?: string;
  aiReason: string;
}

export interface Hallucination {
  id: string;
  /** 条目标题 —— 报告里直接给人看，UUID 没人读得懂 */
  title: string;
  token: string;
  reason: string;
}

export interface JudgmentMetrics {
  truePositive: number;
  /** 人工推荐、AI 判不推荐 —— 漏判 */
  falseNegative: number;
  /** 人工不推荐、AI 判推荐 —— 误判 */
  falsePositive: number;
  trueNegative: number;

  precision: number;
  recall: number;
  f1: number;

  falseNegativeRate: number;
  falsePositiveRate: number;

  falseNegatives: FailedItem[];
  falsePositives: FailedItem[];

  /** 1 − 自动提升数 / 不推荐数。自动提升 = 模型引不出否定依据，被系统降级 */
  evidenceSelfConsistency: number;
  autoPromotedCount: number;
  notRecommendedCount: number;

  /** reason 里出现的、经历与 JD 原文中都找不到的技术名词或百分比 */
  reasonHallucinationRate: number;
  hallucinations: Hallucination[];
}

const ratio = (num: number, den: number): number => (den === 0 ? 1 : num / den);

/** HTML 去掉标签，只留文字，用于核对 reason 里的事实 */
const plainText = (entity: ProfileEntity): string => {
  const raw = [
    entity.title,
    entity.subtitle,
    entity.dateRange,
    entity.description,
    ...(entity.tags ?? []),
    ...(entity.skills ?? []),
    ...(entity.metrics ?? []),
  ].join(" ");
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
};

/**
 * 从 reason 里挑出「可核对的具体事实」。
 *
 * 只挑两类，因为它们无歧义：
 * - 拉丁字母技术名词（Python、DolphinDB、Barra）—— 编不出来就是编的
 * - 百分比数字（40%）—— 最容易被编造、也最容易被识破
 *
 * 刻意**不**挑中文名词和普通数字：「2 年经验」这类表述可以由日期推算出来，
 * 判成幻觉是误报。宁可漏报，不要误报 —— 一个误报会让人不再信这张表。
 */
const FACT_TOKEN = /[A-Za-z][A-Za-z0-9+#._-]{2,}|\d+(?:\.\d+)?%/g;

const findHallucinations = (
  entity: ProfileEntity,
  reason: string,
  /**
   * JD 原文。
   *
   * 必须一起查 —— 新 prompt 要求「reason 点出它对应 JD 的哪一条要求」，
   * 于是理由里会合法地出现 JD 的术语（P99、Canvas、SPA）。
   * 只查条目原文的话，这些全会被判成幻觉：实测 8 条误报里 5 条是这么来的。
   */
  jdText: string
): Hallucination[] => {
  const text = `${plainText(entity)} ${jdText.toLowerCase()}`;
  const hits: Hallucination[] = [];
  const seen = new Set<string>();

  for (const token of reason.match(FACT_TOKEN) ?? []) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!text.includes(key)) hits.push({ id: entity.id, title: entity.title, token, reason });
  }

  return hits;
};

export const computeJudgmentMetrics = (
  analysis: MatchAnalysis | null,
  gold: Record<string, GoldEntity>,
  entities: ProfileEntity[],
  /** JD 原文，用于判断理由里的术语是引用 JD 还是编造 */
  jdText = ""
): JudgmentMetrics => {
  const byId = new Map(entities.map((e) => [e.id, e]));

  let tp = 0;
  let fn = 0;
  let fp = 0;
  let tn = 0;
  const falseNegatives: FailedItem[] = [];
  const falsePositives: FailedItem[] = [];
  const hallucinations: Hallucination[] = [];

  let autoPromotedCount = 0;
  let notRecommendedCount = 0;

  for (const [id, goldEntity] of Object.entries(gold)) {
    const entity = byId.get(id);
    if (!entity) continue;

    const item = analysis?.items[id];
    // 模型没给这条判定时按「不推荐」计 —— 沉默不等于推荐
    const aiLevel = item?.level ?? "not_recommended";
    const aiReason = item?.reason ?? "";

    if (item?.autoPromoted) autoPromotedCount += 1;
    if (aiLevel === "not_recommended") notRecommendedCount += 1;

    if (goldEntity.level === "recommended" && aiLevel === "recommended") tp += 1;
    else if (goldEntity.level === "recommended") {
      fn += 1;
      falseNegatives.push({
        id,
        title: entity.title,
        goldReason: goldEntity.reason,
        aiReason,
      });
    } else if (aiLevel === "recommended") {
      fp += 1;
      falsePositives.push({
        id,
        title: entity.title,
        goldReason: goldEntity.reason,
        aiReason,
      });
    } else tn += 1;

    if (aiReason) hallucinations.push(...findHallucinations(entity, aiReason, jdText));
  }

  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const reasonCount = Object.keys(gold).length;

  return {
    truePositive: tp,
    falseNegative: fn,
    falsePositive: fp,
    trueNegative: tn,
    precision,
    recall,
    f1,
    falseNegativeRate: ratio(fn, fn + tp),
    falsePositiveRate: ratio(fp, fp + tn),
    falseNegatives,
    falsePositives,
    // 没有「不推荐」判定时视为无瑕疵：分母为 0 说明模型没做否定判断，
    // 或全部条目都推荐了 —— 后者由误判率负责暴露
    evidenceSelfConsistency: 1 - ratio(autoPromotedCount, notRecommendedCount),
    autoPromotedCount,
    notRecommendedCount,
    reasonHallucinationRate: ratio(hallucinations.length, reasonCount),
    hallucinations,
  };
};
