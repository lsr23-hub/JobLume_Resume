import type { ProfileEntity } from "@/types/profile";
import type {
  MatchAnalysis,
  MatchItemResult,
  Requirement,
  RequirementKind,
  RequirementStatus,
} from "@/types/jobTarget";
import { stripHtml, TOP_N } from "./buildMatchPrompt";

/** 模型返回的原始条目形状（字段都可能缺失或类型不符） */
interface RawItem {
  id?: unknown;
  level?: unknown;
  reason?: unknown;
  evidence?: unknown;
  matchedSkills?: unknown;
  missingSkills?: unknown;
  suggestedFocus?: unknown;
  requirementIds?: unknown;
}

/** 模型返回的原始要求形状 */
interface RawRequirement {
  id?: unknown;
  text?: unknown;
  keys?: unknown;
  kind?: unknown;
  status?: unknown;
  entityIds?: unknown;
  sourceQuote?: unknown;
}

interface RawPayload {
  items?: unknown;
  requirements?: unknown;
  summary?: unknown;
}

/**
 * 校验记录。
 *
 * **判别式联合而不是 `entityId?: string`**：可选字段会让类型系统不再帮忙，
 * 任何 `corrections.filter(c => c.entityId === id)` 都会把要求维度的记录
 * 静默算进去或漏掉。分开之后编译器强制你在每一处先判 scope。
 */
export type Correction =
  | {
      scope: "entity";
      entityId: string;
      type: "skill_not_found" | "duplicate" | "unknown_id" | "omitted";
      detail: string;
    }
  | {
      scope: "requirement";
      requirementId: string;
      type: "unknown_entity" | "no_evidence" | "unknown_requirement" | "invalid_field";
      detail: string;
    };

export interface ValidateResult {
  analysis: MatchAnalysis;
  corrections: Correction[];
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

/** reason 是给人扫一眼的摘要。prompt 说 20 字，但校验器一直没管 —— 模型不听话时这是唯一不靠它配合的闸门 */
const REASON_MAX_CHARS = 40;

/**
 * 归一化后比对 —— 忽略空白与**分隔符**差异，但内容字面必须一致。
 *
 * 为什么连分隔符也去掉：模型引用多个字段时会自己补分隔符，
 * 比如 `英语 | CET-6 · 可熟练阅读英文技术文档`，而条目里这两个字段
 * 是空格连起来的 —— 去空白后是 `英语CET-6·...`，那个 `|` 就让整段引用匹配不上。
 *
 * 分隔符不是内容，两边都该去掉。这不影响「防编造」：内容字符仍须逐字一致。
 */
const SEPARATOR_PATTERN = /[\s|｜/／·・、,，;；]+/g;

const normalizeForMatch = (text: string): string => text.replace(SEPARATOR_PATTERN, "");

/**
 * 覆盖情况 → 三个原子词列表（`summary.coverage`）。
 *
 * **只取 must 与 nice**：没做过 JD 里写的某段岗位职责不是缺陷，是换工作的常态。
 * 混进 `missing` 会让界面上那句「缺失项只作提示」读起来是错的，也会污染评测。
 *
 * 取 `keys` 而不是 `text`：评测的匹配器是在「原子对原子」上标定的，
 * 喂整句会撞出更多偶然的三字重叠，让指标静默漂移。
 */
export const deriveCoverage = (
  requirements: Requirement[]
): MatchAnalysis["summary"]["coverage"] => {
  const buckets: Record<RequirementStatus, string[]> = { covered: [], weak: [], missing: [] };
  const seen = new Set<string>();

  for (const requirement of requirements) {
    if (requirement.kind === "duty") continue;
    for (const key of requirement.keys.length > 0 ? requirement.keys : [requirement.text]) {
      const normalized = key.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      buckets[requirement.status].push(normalized);
    }
  }

  return buckets;
};

/**
 * 取一份分析里的要求项。
 *
 * **所有读点都必须走这里**，不要直接摸 `analysis.requirements` ——
 * localStorage 里与备份文件里的旧分析没有这个字段（prompt v5 之前），
 * 直接读会拿到 `undefined`。
 *
 * 旧数据不是「空清单」，而是「有清单但指不到经历」—— 由旧的三个数组反推出来，
 * 比显示「暂无要求」诚实。
 */
export const requirementsOf = (analysis: MatchAnalysis | null | undefined): Requirement[] => {
  if (!analysis) return [];
  if (Array.isArray(analysis.requirements)) return analysis.requirements;
  return legacyRequirements(analysis.summary?.coverage);
};

const legacyRequirements = (
  coverage: MatchAnalysis["summary"]["coverage"] | undefined
): Requirement[] => {
  if (!coverage) return [];
  const out: Requirement[] = [];
  const statuses: RequirementStatus[] = ["covered", "weak", "missing"];
  for (const status of statuses) {
    asStringArray(coverage[status]).forEach((text, index) => {
      out.push({
        id: `legacy-${status}-${index}`,
        text,
        keys: [text],
        kind: "must",
        status,
        entityIds: [],
        // 旧数据没有原文依据，界面据此标「无原文依据」
        sourceQuote: "",
      });
    });
  }
  return out;
};

const asKind = (value: unknown): RequirementKind =>
  value === "nice" || value === "duty" ? value : "must";

/**
 * 要求项的校验与归一化。
 *
 * **一条原则：证据不足或自相矛盾时一律落到 `weak`。**
 * 标 `missing` 是在断言「你没有」，说错了会让用户以为自己不够格、白跑一趟；
 * `weak` 是软着陆，最坏情况只是少说了一句好话。
 */
const normalizeRequirements = (
  rawList: unknown,
  byId: Map<string, ProfileEntity>,
  jdText: string,
  corrections: Correction[]
): Requirement[] => {
  const list = Array.isArray(rawList) ? (rawList as RawRequirement[]) : [];
  const out: Requirement[] = [];
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();

  list.forEach((rawRequirement, index) => {
    const text = typeof rawRequirement.text === "string" ? rawRequirement.text.trim() : "";
    if (!text) {
      corrections.push({
        scope: "requirement",
        requirementId: `#${index + 1}`,
        type: "invalid_field",
        detail: "缺少要求描述，已丢弃",
      });
      return;
    }

    const rawId = typeof rawRequirement.id === "string" ? rawRequirement.id.trim() : "";
    const id = rawId || `r${index + 1}`;
    if (seenIds.has(id)) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "invalid_field",
        detail: "要求 id 重复，保留第一条",
      });
      return;
    }
    const textKey = normalizeForMatch(text);
    if (seenTexts.has(textKey)) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "invalid_field",
        detail: "要求内容重复，保留第一条",
      });
      return;
    }
    seenIds.add(id);
    seenTexts.add(textKey);

    // ── 证据：支撑这条要求的是哪几条经历 ──
    const entityIds = asStringArray(rawRequirement.entityIds).filter((entityId) => {
      if (byId.has(entityId)) return true;
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "unknown_entity",
        detail: `经历「${entityId}」不在输入集合中，已丢弃`,
      });
      return false;
    });

    // ── 状态：证据不足或自相矛盾都落到 weak ──
    const rawStatus = rawRequirement.status;
    let status: RequirementStatus =
      rawStatus === "covered" || rawStatus === "weak" || rawStatus === "missing"
        ? rawStatus
        : "weak";
    if (rawStatus !== status) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "invalid_field",
        detail: `status「${String(rawStatus)}」不是合法取值，已按 weak 处理`,
      });
    }
    if (status === "covered" && entityIds.length === 0) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "no_evidence",
        detail: "标为 covered 但指不出任何经历，已降级为 weak",
      });
      status = "weak";
    }
    if (status === "missing" && entityIds.length > 0) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "no_evidence",
        detail: "标为 missing 却又指出了支撑经历，已按 weak 处理",
      });
      status = "weak";
    }

    // ── 原文依据：引不出原文的要求不丢弃，只是不再声称有依据 ──
    let sourceQuote =
      typeof rawRequirement.sourceQuote === "string" ? rawRequirement.sourceQuote.trim() : "";
    if (sourceQuote && jdText && !normalizeForMatch(jdText).includes(normalizeForMatch(sourceQuote))) {
      corrections.push({
        scope: "requirement",
        requirementId: id,
        type: "no_evidence",
        detail: `原文依据「${sourceQuote.slice(0, 30)}」在 JD 里找不到，已清空`,
      });
      sourceQuote = "";
    }

    const keys = asStringArray(rawRequirement.keys);
    out.push({
      id,
      text,
      // 没给原子词就退回整句：宁可让这条在覆盖度里显得啰嗦，也不要让它凭空消失
      keys: keys.length > 0 ? keys : [text],
      kind: asKind(rawRequirement.kind),
      status,
      entityIds: status === "missing" ? [] : entityIds,
      sourceQuote,
    });
  });

  return out;
};

/**
 * 校验并修正模型返回的分析结果。
 *
 * 核心是**每条判定都要能落地**：
 * - 经历排序：漏掉的条目补在末尾（「没提到」是优先级最低，不是「不推荐」）
 * - 技能：引不出条目原文的丢弃（v1~v3 遗留）
 * - 要求项：说 covered 就必须指得出具体经历，指不出降到 weak；
 *   给出的 JD 原文依据必须真的在 JD 里（引不出就清空，但仍保留这条要求 ——
 *   隐含要求本来就引不出原文，丢掉它等于丢掉最有价值的那部分）
 *
 * 这把提示词里的软约束变成了程序可验证的硬约束，不依赖模型是否听话。
 */
export const validateMatchResult = (
  raw: unknown,
  options: {
    entities: ProfileEntity[];
    /** JD 原文，用于核对每条要求的原文依据 */
    jdRaw: string;
    modelId: string;
    promptVersion: string;
    analyzedAt: string;
    /** 打★的数量，默认 TOP_N */
    topN?: number;
  }
): ValidateResult => {
  const corrections: Correction[] = [];
  const byId = new Map(options.entities.map((e) => [e.id, e]));

  const payload: RawPayload = raw && typeof raw === "object" ? (raw as RawPayload) : {};

  // 要求项要先校验 —— items 里的 requirementIds 拿它做存在性检查
  const requirements = normalizeRequirements(
    payload.requirements,
    byId,
    options.jdRaw ?? "",
    corrections
  );
  const requirementIds = new Set(requirements.map((r) => r.id));

  const rawItems: RawItem[] = Array.isArray(payload.items) ? (payload.items as RawItem[]) : [];

  // ── 逐条校验，同时记录模型返回的顺序（即优先级）──
  const rankedIds: string[] = [];
  const items: Record<string, MatchItemResult> = {};

  for (const rawItem of rawItems) {
    const id = typeof rawItem.id === "string" ? rawItem.id : "";
    const entity = byId.get(id);

    if (!entity) {
      corrections.push({ scope: "entity", entityId: id, type: "unknown_id", detail: "id 不在输入集合中，已丢弃" });
      continue;
    }
    if (id in items) {
      corrections.push({ scope: "entity", entityId: id, type: "duplicate", detail: "重复出现，保留第一条" });
      continue;
    }

    const rawReason = typeof rawItem.reason === "string" ? rawItem.reason.trim() : "";
    const reason =
      rawReason.length > REASON_MAX_CHARS ? rawReason.slice(0, REASON_MAX_CHARS) : rawReason;

    // 搜索范围必须覆盖**模型实际看得到的全部用户输入** ——
    // prompt 里序列化了标题、副标题、时间、描述、技能、成果，
    // 模型引用副标题是合法的，只在描述里找会误判为「无法举证」。
    const entityText = normalizeForMatch(
      [
        entity.title,
        entity.subtitle,
        entity.dateRange,
        stripHtml(entity.description),
        ...entity.skills,
        ...entity.metrics,
      ].join(" ")
    );

    const matchedSkills = asStringArray(rawItem.matchedSkills).filter((skill) => {
      const hit = entityText.includes(normalizeForMatch(skill));
      if (!hit) {
        corrections.push({
          scope: "entity",
          entityId: id,
          type: "skill_not_found",
          detail: `技能「${skill}」在该条目中找不到出处，已丢弃`,
        });
      }
      return hit;
    });

    const linkedRequirements = asStringArray(rawItem.requirementIds).filter((requirementId) => {
      if (requirementIds.has(requirementId)) return true;
      corrections.push({
        scope: "requirement",
        requirementId,
        type: "unknown_requirement",
        detail: `条目「${entity.title}」引用了不存在的要求 id，已丢弃`,
      });
      return false;
    });

    items[id] = {
      // level 与 inTopN 都要等排完序才知道，先占位
      level: "not_recommended",
      reason,
      evidence: "",
      inTopN: false,
      matchedSkills,
      requirementIds: linkedRequirements,
      missingSkills: asStringArray(rawItem.missingSkills),
      ...(typeof rawItem.suggestedFocus === "string" && rawItem.suggestedFocus.trim()
        ? { suggestedFocus: rawItem.suggestedFocus.trim() }
        : {}),
    };
    rankedIds.push(id);
  }

  // ── 模型漏掉的条目补在最后 ──
  // 排序任务里「没提到」= 优先级最低，而不是「不推荐」——
  // 补在末尾，用户仍看得到，不会静默丢掉一段经历
  for (const entity of options.entities) {
    if (entity.id in items) continue;
    corrections.push({
      scope: "entity",
      entityId: entity.id,
      type: "omitted",
      detail: "模型没有给它排序，已置于末尾",
    });
    items[entity.id] = {
      level: "not_recommended",
      reason: "",
      evidence: "",
      inTopN: false,
      matchedSkills: [],
      requirementIds: [],
      missingSkills: [],
    };
    rankedIds.push(entity.id);
  }

  // ── 由排名推出 level 与 top-N ──
  //
  // 模型不再输出「推荐/不推荐」这个二分标签 —— 该在哪划线取决于用户这份简历
  // 放得下几条，而那个信息不在 prompt 里。划线交给代码，名额由用户定。
  // 这里的 level 只用于界面上的轻重区分（前 N 条给★），不参与评测计分。
  const topN = options.topN ?? TOP_N;
  rankedIds.forEach((id, index) => {
    const item = items[id];
    if (!item) return;
    item.inTopN = index < topN;
    item.level = index < topN ? "recommended" : "not_recommended";
  });

  const summary = (payload.summary ?? {}) as Record<string, unknown>;

  return {
    analysis: {
      items,
      rankedIds,
      topN,
      requirements,
      summary: {
        recommendedCount: Object.values(items).filter((i) => i.level === "recommended").length,
        // 派生字段：评测与报告读的是它，形态与 v4 一致，但产生方式变了
        coverage: deriveCoverage(requirements),
        advice: typeof summary.advice === "string" ? summary.advice.trim() : "",
      },
      modelId: options.modelId,
      promptVersion: options.promptVersion,
      analyzedAt: options.analyzedAt,
    },
    corrections,
  };
};

/** 从模型返回的文本中提取 JSON —— 容忍 ```json 代码块与前后废话 */
export const parseMatchPayload = (text: string): unknown => {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 继续尝试其他形式 */
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* 继续 */
    }
  }

  const block = trimmed.match(/\{[\s\S]*\}/);
  if (block?.[0]) {
    try {
      return JSON.parse(block[0]);
    } catch {
      /* 放弃 */
    }
  }

  return null;
};
