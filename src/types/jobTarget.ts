/**
 * LLM 匹配分析的类型。
 *
 * v1 中 AI 只做推荐标注，不参与生成：它标注每条经历「值不值得放进这份简历」，
 * 并标出最推荐的前 N 条。是否放入由用户勾选决定。
 *
 * 注：`JobTarget`（投递目标）与 `AnalysisCache` 属于 Phase 3，届时在此文件补充。
 */

/**
 * 匹配等级。二值制，不做程度分档。
 *
 * 档位越少判断越稳定，用户也越容易理解。
 * 单设 `inTopN` 而非增加中间档 —— 「推荐条目多于版面容量」是排序问题不是程度问题。
 */
export type MatchLevel = "recommended" | "not_recommended";

export interface MatchItemResult {
  level: MatchLevel;

  /** 判断依据，一句话 */
  reason: string;

  /**
   * 逐字引用条目描述中的原文。
   * `level` 为 `not_recommended` 时必填，且必须能在 description 中找到；
   * 否则由 validateMatchResult() 自动提升为 `recommended`（无法举证就不该否定）。
   */
  evidence: string;

  /**
   * 是否入选「最推荐的 N 条」。
   * 由 LLM 返回数组的顺序决定，仅表示优先级、不表示资格。
   */
  inTopN: boolean;

  /** 从该条目中提取的、与 JD 相关的技能 */
  matchedSkills: string[];

  /** JD 要求但该条目未体现的技能 */
  missingSkills: string[];

  /** 建议突出的内容，供后续改写环节使用 */
  suggestedFocus?: string;

  /** 用户是否手动改变过该条目的勾选状态 */
  manuallyAdjusted?: boolean;
}

export interface MatchAnalysis {
  /** 逐条目的分析结果，key 为 entityId */
  items: Record<string, MatchItemResult>;

  /**
   * LLM 返回的条目顺序（推荐强度降序）。
   * 单独保存是因为 items 是 Record，无法从中恢复顺序。
   */
  rankedIds: string[];

  /** 本次的 top-N 设定值 */
  topN: number;

  /** 整体覆盖度分析 */
  summary: {
    recommendedCount: number;
    coverage: {
      /** JD 要求且数据库中有支撑的技能 */
      covered: string[];
      /** JD 要求但支撑薄弱的技能 */
      weak: string[];
      /** JD 要求但数据库中没有的技能 —— 只报告，不伪造 */
      missing: string[];
    };
    advice: string;
  };

  // ─────────── 溯源信息 ───────────

  modelId: string;
  promptVersion: string;
  analyzedAt: string;
}
