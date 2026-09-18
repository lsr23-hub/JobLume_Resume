import type { MatchAnalysis } from "@/types/jobTarget";
import type { GoldEntity } from "../types";

/**
 * 筛选与成品指标。
 *
 * 「筛选」不是独立的一步 AI 调用 —— 它就是在 AI 排序上按篇幅截断
 * （docs/03 §2.3）。页数→条数的换算由工程保证，**AI 的贡献是那个顺序**，
 * 所以这里评的是「如果版面只放得下 K 条，AI 会选对吗」。
 *
 * K 取人工理想集合的大小 —— 拿人工的预算考 AI 的选择。
 */

export interface MissedItem {
  id: string;
  title: string;
  relevance: number;
  mustHave: boolean;
}

export interface SelectionMetrics {
  /** 预算内能放的条数 */
  budget: number;

  /** AI 取前 K 条 vs 人工理想集合 */
  idealJaccard: number;

  /** 关键经历进了多少 —— 漏掉一条决定性经历，简历就废了 */
  mustHaveRecall: number;
  mustHaveTotal: number;

  /**
   * 选择质量 = AI 所选条目的相关度之和 / 最优 K 条的相关度之和。
   * 1.0 表示在同样篇幅下选到了最好的那一组。
   */
  selectionQuality: number;

  missed: MissedItem[];
  wronglyIncluded: MissedItem[];
}

const jaccard = (a: Set<string>, b: Set<string>): number => {
  const union = new Set(Array.from(a).concat(Array.from(b)));
  if (union.size === 0) return 1;
  let intersection = 0;
  Array.from(a).forEach((id) => {
    if (b.has(id)) intersection += 1;
  });
  return intersection / union.size;
};

export const computeSelectionMetrics = (
  analysis: MatchAnalysis | null,
  gold: Record<string, GoldEntity>,
  idealSelection: string[],
  titles: Record<string, string> = {}
): SelectionMetrics => {
  const budget = idealSelection.length;

  // AI 的取舍顺序就是它的排序；没有排序时退化为「全部推荐项」
  const ranked = (analysis?.rankedIds ?? []).filter((id) => id in gold);
  const aiSelection = ranked.slice(0, budget);

  const aiSet = new Set(aiSelection);
  const idealSet = new Set(idealSelection);

  const mustHaveIds = Object.entries(gold)
    .filter(([, g]) => g.mustHave)
    .map(([id]) => id);

  const idealRelevanceSum = Array.from(idealSet)
    .map((id) => gold[id]?.relevance ?? 0)
    .sort((a, b) => b - a)
    .reduce<number>((s, x) => s + x, 0);

  const aiRelevanceSum = aiSelection.reduce<number>(
    (s, id) => s + (gold[id]?.relevance ?? 0),
    0
  );

  const describe = (id: string): MissedItem => ({
    id,
    title: titles[id] ?? id,
    relevance: gold[id]?.relevance ?? 0,
    mustHave: Boolean(gold[id]?.mustHave),
  });

  return {
    budget,
    idealJaccard: jaccard(aiSet, idealSet),
    mustHaveRecall:
      mustHaveIds.length === 0
        ? 1
        : mustHaveIds.filter((id) => aiSet.has(id)).length / mustHaveIds.length,
    mustHaveTotal: mustHaveIds.length,
    selectionQuality: idealRelevanceSum === 0 ? 1 : aiRelevanceSum / idealRelevanceSum,
    missed: idealSelection.filter((id) => !aiSet.has(id)).map(describe),
    wronglyIncluded: aiSelection.filter((id) => !idealSet.has(id)).map(describe),
  };
};
