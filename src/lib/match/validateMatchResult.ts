import type { ProfileEntity } from "@/types/profile";
import type { MatchAnalysis, MatchItemResult, MatchLevel } from "@/types/jobTarget";
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
}

interface RawPayload {
  items?: unknown;
  summary?: unknown;
}

export interface Correction {
  entityId: string;
  type: "invalid_level" | "evidence_not_found" | "skill_not_found" | "duplicate" | "unknown_id";
  detail: string;
}

export interface ValidateResult {
  analysis: MatchAnalysis;
  corrections: Correction[];
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

/** 归一化空白，用于证据的子串比对 —— 忽略空白差异，但要求字面一致 */
const normalizeForMatch = (text: string): string => text.replace(/\s+/g, "");

/**
 * 校验并修正模型返回的分析结果。
 *
 * 核心是**证据自洽**：判为 not_recommended 必须逐字引用条目原文
 * （标题 / 副标题 / 时间 / 描述 / 技能 / 成果 —— 即 prompt 里模型看得到的全部内容），
 * 引用不出就提升为 recommended —— 无法举证就不该否定用户的经历。
 * 这把提示词里的软约束变成了程序可验证的硬约束，不依赖模型是否听话。
 */
export const validateMatchResult = (
  raw: unknown,
  options: {
    entities: ProfileEntity[];
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
  const rawItems: RawItem[] = Array.isArray(payload.items) ? (payload.items as RawItem[]) : [];

  // ── 逐条校验，同时记录模型返回的顺序（即推荐强度）──
  const rankedIds: string[] = [];
  const items: Record<string, MatchItemResult> = {};

  for (const rawItem of rawItems) {
    const id = typeof rawItem.id === "string" ? rawItem.id : "";
    const entity = byId.get(id);

    if (!entity) {
      corrections.push({ entityId: id, type: "unknown_id", detail: "id 不在输入集合中，已丢弃" });
      continue;
    }
    if (id in items) {
      corrections.push({ entityId: id, type: "duplicate", detail: "重复出现，保留第一条" });
      continue;
    }

    const rawLevel = rawItem.level;
    let level: MatchLevel = rawLevel === "not_recommended" ? "not_recommended" : "recommended";
    if (rawLevel !== "not_recommended" && rawLevel !== "recommended") {
      corrections.push({
        entityId: id,
        type: "invalid_level",
        detail: `level=${JSON.stringify(rawLevel)} 非法，按推荐处理`,
      });
    }

    const evidence = typeof rawItem.evidence === "string" ? rawItem.evidence.trim() : "";
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

    let autoPromoted = false;
    let reason = typeof rawItem.reason === "string" ? rawItem.reason.trim() : "";

    // 证据自洽：判为不推荐却举不出原文 → 提升为推荐
    if (level === "not_recommended") {
      const cited = normalizeForMatch(evidence);
      if (!cited || !entityText.includes(cited)) {
        corrections.push({
          entityId: id,
          type: "evidence_not_found",
          detail: "否定依据无法在原文中核对，已提升为推荐",
        });
        level = "recommended";
        autoPromoted = true;
        // 理由与依据描述的是那个已被推翻的否定判断，留着会与新等级矛盾
        reason = "";
      }
    }

    // 与证据校验用同一份文本：模型看到什么，就允许它从什么里提取技能
    const matchedSkills = asStringArray(rawItem.matchedSkills).filter((skill) => {
      const hit = entityText.includes(normalizeForMatch(skill));
      if (!hit) {
        corrections.push({
          entityId: id,
          type: "skill_not_found",
          detail: `技能「${skill}」在该条目中找不到出处，已丢弃`,
        });
      }
      return hit;
    });

    items[id] = {
      level,
      reason,
      evidence: autoPromoted ? "" : evidence,
      inTopN: false, // 稍后统一计算
      matchedSkills,
      missingSkills: asStringArray(rawItem.missingSkills),
      ...(autoPromoted ? { autoPromoted: true } : {}),
      ...(typeof rawItem.suggestedFocus === "string" && rawItem.suggestedFocus.trim()
        ? { suggestedFocus: rawItem.suggestedFocus.trim() }
        : {}),
    };
    rankedIds.push(id);
  }

  // ── 遗漏的条目补为「推荐但未分析」——不静默丢弃用户的经历 ──
  for (const entity of options.entities) {
    if (entity.id in items) continue;
    items[entity.id] = {
      level: "recommended",
      reason: "",
      evidence: "",
      inTopN: false,
      matchedSkills: [],
      missingSkills: [],
    };
    rankedIds.push(entity.id);
  }

  // ── top-N：rankedIds 中前 N 个「推荐」条目 ──
  const topN = options.topN ?? TOP_N;
  let marked = 0;
  for (const id of rankedIds) {
    if (marked >= topN) break;
    const item = items[id];
    if (item?.level === "recommended") {
      item.inTopN = true;
      marked += 1;
    }
  }

  const summary = (payload.summary ?? {}) as Record<string, unknown>;
  const coverage = (summary.coverage ?? {}) as Record<string, unknown>;

  return {
    analysis: {
      items,
      rankedIds,
      topN,
      summary: {
        recommendedCount: Object.values(items).filter((i) => i.level === "recommended").length,
        coverage: {
          covered: asStringArray(coverage.covered),
          weak: asStringArray(coverage.weak),
          missing: asStringArray(coverage.missing),
        },
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
