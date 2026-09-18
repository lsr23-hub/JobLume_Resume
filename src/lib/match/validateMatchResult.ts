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
  type: "skill_not_found" | "duplicate" | "unknown_id" | "omitted";
  detail: string;
}

export interface ValidateResult {
  analysis: MatchAnalysis;
  corrections: Correction[];
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];

/**
 * 归一化后比对证据 —— 忽略空白与**分隔符**差异，但内容字面必须一致。
 *
 * 为什么连分隔符也去掉：模型引用多个字段时会自己补分隔符，
 * 比如 `英语 | CET-6 · 可熟练阅读英文技术文档`，而条目里这两个字段
 * 是空格连起来的（`英语 CET-6 · ...`）—— 去空白后是 `英语CET-6·...`，
 * 那个 `|` 就让整段引用匹配不上，**正确的否定判断被系统自己推翻成推荐**。
 *
 * 分隔符不是内容，两边都该去掉。这不影响「防编造」：内容字符仍须逐字一致。
 */
const SEPARATOR_PATTERN = /[\s|｜/／·・、,，;；]+/g;

const normalizeForMatch = (text: string): string =>
  text.replace(SEPARATOR_PATTERN, "");

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

    const reason = typeof rawItem.reason === "string" ? rawItem.reason.trim() : "";

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
          entityId: id,
          type: "skill_not_found",
          detail: `技能「${skill}」在该条目中找不到出处，已丢弃`,
        });
      }
      return hit;
    });

    items[id] = {
      // level 与 inTopN 都要等排完序才知道，先占位
      level: "not_recommended",
      reason,
      evidence: "",
      inTopN: false,
      matchedSkills,
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
