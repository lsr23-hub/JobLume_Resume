/**
 * LLM 匹配分析的类型。
 *
 * prompt v4 起模型**只排序、不判定**：「该在哪划线」取决于用户这份简历放得下几条，
 * 模型无从知道。`level` / `inTopN` 因此退化为由名次派生的展示标记。
 *
 * prompt v5 起 coverage 换成结构化要求项（`requirements`）—— 每条要求带类型、
 * 覆盖状态、指向的具体经历、以及 JD 原文依据，判定由代码校验而非模型自述。
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
   *
   * 残留字段：v1~v3 用它给「不推荐」举证，引不出就自动改判为推荐。
   * v4 起模型不再下否定判断，没有地方会写它，界面上那个「依据」入口是死代码。
   */
  evidence: string;

  /**
   * 是否入选「最推荐的 N 条」。
   * 由 LLM 返回数组的顺序决定，仅表示优先级、不表示资格。
   */
  inTopN: boolean;

  /** 从该条目中提取的、与 JD 相关的技能 */
  matchedSkills: string[];

  /**
   * 该条目支撑了哪几条要求（引用 `Requirement.id`）。
   *
   * 与 `requirements[].entityIds` 是同一个关系的两个方向 —— 两向对不上就是模型
   * 自相矛盾，这是**唯一能靠输出本身发现的不一致**。校验时会丢弃不存在的 id。
   */
  requirementIds: string[];

  /** JD 要求但该条目未体现的技能 */
  missingSkills: string[];

  /** 建议突出的内容。模型会返回，但界面尚未消费 —— 改写类功能已按产品决策移除 */
  suggestedFocus?: string;

  /**
   * 该条目原判为「不推荐」，但因否定依据无法在原文中核对而被系统提升为推荐。
   *
   * 界面据此显示说明文案 —— 此时 `reason` 与 `evidence` 已被清空，
   * 因为它们描述的是那个已被推翻的否定判断，留着会与新等级自相矛盾。
   */
  autoPromoted?: boolean;
}

/** 要求的类别。职责类不参与「缺失」判定 —— 没做过 JD 写的岗位职责不是缺陷 */
export type RequirementKind = "must" | "nice" | "duty";

export type RequirementStatus = "covered" | "weak" | "missing";

export interface Requirement {
  /** 本次分析内的局部 id（r1、r2…），只用于与 `items[].requirementIds` 互指，不跨运行稳定 */
  id: string;

  /** 展示给人看的要求描述 */
  text: string;

  /**
   * 原子词，用来派生 `summary.coverage`。
   *
   * 必须是**技能级**粒度而不是整句：评测的 `isSameSkill` 匹配器是在
   * 「原子对原子」上标定的，喂整句会撞出更多偶然的三字重叠、让指标静默漂移。
   */
  keys: string[];

  kind: RequirementKind;

  status: RequirementStatus;

  /** 支撑这条要求的经历 id；`status` 为 `missing` 时为空数组 */
  entityIds: string[];

  /**
   * JD 原文片段。
   *
   * **空串的含义是「这条要求没有可核对的原文依据」** —— 两种来源：
   * 模型自己推断出来的（JD 没明写），或模型给了一段 JD 里找不到的引用
   * （校验时清空并记 `Correction`）。隐含要求本来就引不出原文，
   * 所以是清空而不是丢弃这条要求。
   *
   * 界面据此标「无原文依据」，不区分是哪一种 —— 对用户来说都是
   * 「这条你得自己判断」。
   */
  sourceQuote: string;
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

  /**
   * JD 要求项。prompt v5 起由模型逐条抽取，每条带覆盖状态与指向的经历。
   *
   * **可选**：localStorage 里与备份文件里的旧分析没有这个字段，读取侧必须先过
   * `requirementsOf()`（`@/lib/match/validateMatchResult`）拿到归一化后的数组。
   */
  requirements?: Requirement[];

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

// ─────────────────────────────────────────────────────────────
// 投递目标（Phase 3）
// ─────────────────────────────────────────────────────────────

export interface JobTarget {
  id: string;

  /** 公司名（用户填写） */
  company: string;

  /** 岗位名（用户填写） */
  position: string;

  /** JD 正文原文 —— 不做预解析，原样作为 LLM 分析的输入 */
  jdRaw: string;

  /** 用户备注 */
  note?: string;

  /**
   * 最近一次匹配分析结果，没有就是 null。
   *
   * **单槽**：v2 起岗位本身按用户隔离（见 `plan/task_plan.md` 的存档目录一节），
   * 一份岗位副本只属于一个人，不需要再按 userId 索引。v1 那层 `analysesByUser`
   * 存在的唯一理由是「岗位共享、分析不共享」，前提没了，层也就没了。
   *
   * 用 null 而不是可选字段：迁移与归一化一律把两个槽都写满，
   * 读取侧因此不必区分「没有这个键」与「没有分析」。
   */
  matchAnalysis: MatchAnalysis | null;

  /** 上面那份分析对应的缓存信息，没有就是 null */
  analysisCache: AnalysisCache | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * 分析缓存。
 * 指纹一致时直接复用 matchAnalysis，不重新调用模型 —— 这是可复现性的第四道防线。
 */
export interface AnalysisCache {
  /** 数据库全部条目内容 + JD 正文 的哈希 */
  contentFingerprint: string;

  /**
   * 逐条目的内容指纹。用于定位「是哪几条变了」——
   * 只存合并哈希的话，只能知道数据变了，无法告诉用户变了什么。
   */
  entityFingerprints: Record<string, string>;

  /** 模型标识，换模型必然改变结果 */
  modelId: string;

  /** 提示词模板版本，模板改动必须使缓存失效 */
  promptVersion: string;

  analyzedAt: string;
}
