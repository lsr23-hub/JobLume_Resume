import type { MatchAnalysis } from "@/types/jobTarget";
import type { GoldEntity, Relevance } from "../types";

/**
 * 排序指标。
 *
 * 排序服务的是「HR 注意力有限，最匹配的放最前」（docs/03 §3.7），
 * 所以评的是**顺序质量**，不是判定对错 —— 判定由 judgment 那组负责。
 */

export interface RankingMetrics {
  /** 人工 top-5 与 AI 前 5 的交集比例 */
  top5HitRate: number;
  /** 归一化折损累计增益，人工相关度做分级 */
  ndcgAt5: number;
  /** 斯皮尔曼等级相关：AI 顺序 vs 人工相关度 */
  spearman: number;

  aiTop5: string[];
  goldTop5: string[];
  /** 人工排名与 AI 排名差得最远的几条，用于失败分析 */
  worstOffenders: Array<{ id: string; title: string; goldRank: number; aiRank: number }>;
}

const TOP_K = 5;

/** 人工排名：相关度降序；同分按 id 稳定排序，保证可复现 */
const goldRanking = (gold: Record<string, GoldEntity>): string[] =>
  Object.keys(gold).sort((a, b) => {
    const diff = (gold[b].relevance ?? 0) - (gold[a].relevance ?? 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

/**
 * 同名次的平均秩。
 *
 * 相关度只有 4 档，必然大量并列 —— 不取平均秩的话，斯皮尔曼会被
 * 「并列内部按 id 排」这个任意顺序污染。
 */
const averageRanks = (values: number[]): number[] => {
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    // 名次从 1 开始，并列取平均
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[order[k].index] = avg;
    i = j + 1;
  }
  return ranks;
};

const pearson = (a: number[], b: number[]): number => {
  const n = a.length;
  if (n < 2) return 1;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }

  // 某一侧完全没有差异（全部同分）时相关性无定义，按「不矛盾」记 1
  if (varA === 0 || varB === 0) return 1;
  return cov / Math.sqrt(varA * varB);
};

const dcg = (relevances: number[]): number =>
  relevances.reduce((sum, rel, index) => sum + (2 ** rel - 1) / Math.log2(index + 2), 0);

export const computeRankingMetrics = (
  analysis: MatchAnalysis | null,
  gold: Record<string, GoldEntity>,
  titles: Record<string, string> = {}
): RankingMetrics => {
  const goldOrder = goldRanking(gold);
  const goldRankOfRaw = new Map(goldOrder.map((id, index) => [id, index + 1]));
  const k = Math.min(TOP_K, goldOrder.length);
  const goldTop = goldOrder.slice(0, k);

  // 只保留人工标注过的条目 —— 模型可能返回标注集之外的 id
  const aiOrder = (analysis?.rankedIds ?? []).filter((id) => id in gold);
  const aiTop = aiOrder.slice(0, k);

  const overlap = aiTop.filter((id) => goldTop.includes(id)).length;

  const idealRelevances = goldTop.map((id) => gold[id].relevance ?? 0);
  const actualRelevances = aiTop.map((id) => gold[id].relevance ?? 0);
  const idcg = dcg(idealRelevances);

  const shared = aiOrder.filter((id) => goldRankOfRaw.has(id));

  // 相关度只有 4 档，必然大量并列。并列项取**平均秩**，否则 gold 侧
  // 「并列内部按 id 排」这个任意顺序会污染斯皮尔曼 —— 全并列时甚至算出 −1，
  // 看起来像 AI 完全排反了，其实只是 id 顺序不同。
  const tiedGoldRanks = averageRanks(shared.map((id) => gold[id]?.relevance ?? 0));
  const goldRankOf = new Map(shared.map((id, index) => [id, tiedGoldRanks[index]]));
  const aiRankOf = new Map(shared.map((id) => [id, aiOrder.indexOf(id) + 1]));

  const spearman = pearson(
    shared.map((id) => goldRankOf.get(id) as number),
    shared.map((id) => aiRankOf.get(id) as number)
  );

  const worstOffenders = shared
    .map((id) => ({
      id,
      title: titles[id] ?? id,
      goldRank: Math.round(goldRankOf.get(id) as number),
      aiRank: aiRankOf.get(id) as number,
    }))
    .sort((a, b) => Math.abs(b.goldRank - b.aiRank) - Math.abs(a.goldRank - a.aiRank))
    .slice(0, 5);

  return {
    top5HitRate: k === 0 ? 1 : overlap / k,
    ndcgAt5: idcg === 0 ? 1 : dcg(actualRelevances) / idcg,
    spearman,
    aiTop5: aiTop,
    goldTop5: goldTop,
    worstOffenders,
  };
};

export type { Relevance };
