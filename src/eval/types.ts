import type { CareerProfile } from "@/types/profile";
import type { MatchAnalysis } from "@/types/jobTarget";
import type { Correction } from "@/lib/match/validateMatchResult";

/**
 * 核心链路评测的数据结构。
 *
 * 评测对象是 `档案 + JD → 判定 + 排序 + 覆盖度 → 简历内容` 这一整条链路，
 * 不是单个函数的正确性（那个由 `src/lib/match/*.test.ts` 保证）。
 */

/** 相关度分级 0-3，用于排序指标。0 = 无关，3 = 决定性 */
export type Relevance = 0 | 1 | 2 | 3;

/**
 * 推荐线：相关度达到这一档即判「推荐」，同时也就进了理想集合。
 *
 * 原本 `level` 与 `idealSelection` 是各写一份的，于是出现了
 * 「集合内有相关度 1、集合外有相关度 2」这种自相矛盾的标注 ——
 * 现在两者都由相关度派生，一个意见，不会打架。
 */
export const RECOMMEND_THRESHOLD = 2;

/** 案例文件里写的标注：只有相关度和「关键经历」，其余都是派生的 */
export interface RawGoldEntity {
  relevance: Relevance;
  /**
   * 必须进简历。**与相关度是两回事**：
   * 相关度是排序信号，这个是「无论排第几都要放进去」——
   * 比如语言能力这类按简历惯例总会列的条目，相关度不高但该在。
   *
   * 理想集合里它优先占位，所以漏掉它评测直接判不合格。
   */
  mustHave?: boolean;
  reason?: string;
}

export interface GoldEntity extends RawGoldEntity {
  /** 派生自 relevance，不是另写一份 */
  level: "recommended" | "not_recommended";
}

export interface GoldRequirements {
  /** 硬性要求 */
  must: string[];
  /** 加分项 */
  nice: string[];
  /** 职责描述 */
  responsibility: string[];
}

export interface GoldStandard {
  requirements: GoldRequirements;
  /** 逐条人工判定，key 为 entityId */
  entities: Record<string, GoldEntity>;

  /**
   * 一页篇幅能放几条 —— 版面容量，不是「该放几条」。
   * 理想集合由此截断而来。
   */
  budget: number;
  /** 派生：相关度降序取前 budget 条 */
  idealSelection: string[];
  targetPages: number;

  /**
   * 人工认为「JD 要求但档案里没有支撑」的技能。
   * 用来算 `coverage.missing` 的召回 —— 漏一条硬性要求会直接误导用户要不要投。
   */
  missingSkills: string[];

  /**
   * 人工认为**不**该出现在 `coverage.covered` 里的技能（可选）。
   * 用来算覆盖虚报率。
   */
  unsupportedSkills?: string[];
}

export interface EvalCase {
  id: string;
  note?: string;
  /** 覆盖维度标签，见 docs/07-eval-design.md §2.3 */
  dimensions: string[];
  /** 档案文件名（dataset/profiles/*.json） */
  profileFile: string;
  jd: {
    company: string;
    position: string;
    jdRaw: string;
  };
  gold: GoldStandard;
  /** 数据集校验时回填，避免每个案例重复一份档案 */
  profile?: CareerProfile;
}

export interface CaseUsage {
  promptChars: number;
  outputChars: number;
  elapsedMs: number;
  /** 桥接期间实际发生的模型调用次数。缓存命中时为 0 */
  calls?: number;
  /** 上游返回的 token 用量（部分提供方不给） */
  tokens?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface CaseRun {
  caseId: string;
  modelType: string;
  modelId: string;
  /** 缓存命中时为 true —— 用于 L1 稳定性检查 */
  fromCache: boolean;
  /** 模型原始输出，失败案例分析要看 */
  raw: string;
  analysis: MatchAnalysis | null;
  corrections: Correction[];
  usage: CaseUsage;
  /** 出错时记录，不计入正确性指标但计入成功率 */
  error?: string;
}

/** 一个案例的全部指标 */
export interface CaseMetrics {
  caseId: string;
  dimensions: string[];
  judgment: import("./metrics/judgment").JudgmentMetrics;
  coverage: import("./metrics/coverage").CoverageMetrics;
  ranking: import("./metrics/ranking").RankingMetrics;
  selection: import("./metrics/selection").SelectionMetrics;
}

/** 阈值定义：不达标就是「这版不能用」，不是「仅供参考」 */
export interface Threshold {
  value: number;
  /** 越大越好还是越小越好 */
  direction: "higher" | "lower";
  label: string;
}

export type MetricKey =
  | "missingRecall"
  | "coverageFalsePositive"
  | "falseNegativeRate"
  | "falsePositiveRate"
  | "evidenceSelfConsistency"
  | "reasonHallucinationRate"
  | "ndcgAt5"
  | "spearman"
  | "top5HitRate"
  | "mustHaveRecall"
  | "idealJaccard"
  | "selectionQuality"
  | "l1Drift"
  | "rerunFlipRate"
  | "rankKendallTau"
  | "perturbationFlipRate";
