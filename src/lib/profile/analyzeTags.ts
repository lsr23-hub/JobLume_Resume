import type { AIModelType } from "@/config/ai";
import type { ProfileEntity } from "@/types/profile";
import { parseModelJson } from "@/lib/parseModelJson";
import { buildTagPrompt, TAG_PROMPT_VERSION } from "./buildTagPrompt";
import { CATEGORY_IDS, isKnownCategory, type CategoryId } from "./categories";

/**
 * 经历自动归类（P5 的类别一半）。
 *
 * 类别是**封闭集**，所以这一半的可复现性接近匹配链路：模型只需要选，
 * 不需要创作。校验因此也能做得很硬 —— 不在词表里的类别一律丢掉，
 * 而不是猜一个最接近的。
 */

export { TAG_PROMPT_VERSION };

export type TagCorrectionType = "unknown_id" | "duplicate" | "invalid_category" | "omitted";

export interface TagCorrection {
  entityId: string;
  type: TagCorrectionType;
  detail: string;
}

export interface TagResult {
  /** entityId → 类别。只含校验通过的 */
  categories: Record<string, CategoryId>;
  corrections: TagCorrection[];
}

/**
 * 模型给的值能不能对上词表。
 *
 * 先看严格相等；不等时再看这个值里**是否恰好包含一个**已知类别
 * （模型可能写成「金融行业」「互联网 / 软件」）。包含零个或多个都算对不上 ——
 * 对不上就丢掉并记录，**不要猜**：类别会直接显示在经历列表和候选人列表上，
 * 猜错比留空更糟。
 */
export const resolveCategory = (value: unknown): CategoryId | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (isKnownCategory(text)) return text;

  const hits = CATEGORY_IDS.filter((id) => text.includes(id));
  return hits.length === 1 ? hits[0] : null;
};

export const validateTagResult = (raw: unknown, entities: ProfileEntity[]): TagResult => {
  const corrections: TagCorrection[] = [];
  const categories: Record<string, CategoryId> = {};
  const byId = new Set(entities.map((e) => e.id));

  const payload = raw && typeof raw === "object" ? (raw as { items?: unknown }) : {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  for (const entry of items) {
    const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const id = typeof item.id === "string" ? item.id : "";

    if (!byId.has(id)) {
      corrections.push({ entityId: id, type: "unknown_id", detail: "id 不在输入集合中，已丢弃" });
      continue;
    }
    if (id in categories) {
      corrections.push({ entityId: id, type: "duplicate", detail: "重复出现，保留第一条" });
      continue;
    }

    const category = resolveCategory(item.category);
    if (!category) {
      corrections.push({
        entityId: id,
        type: "invalid_category",
        detail: `类别「${String(item.category)}」不在词表里，已丢弃`,
      });
      continue;
    }
    categories[id] = category;
  }

  for (const entity of entities) {
    if (entity.id in categories) continue;
    corrections.push({
      entityId: entity.id,
      type: "omitted",
      detail: "模型没有给它归类",
    });
  }

  return { categories, corrections };
};

export interface TagConfig {
  apiKey: string;
  model: string;
  modelType: AIModelType;
}

export type TagOutcome =
  | { ok: true; categories: Record<string, CategoryId>; corrections: TagCorrection[] }
  | { ok: false; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 跑一次自动归类。
 *
 * 解析放进 attempt 里，让「返回的不是合法 JSON」也能享受那次重试 ——
 * 与匹配链路同样的理由：截断之类的问题发生在请求**之后**，
 * 重试只看传输层的话它一次都不会重试。
 */
export const analyzeTags = async (
  entities: ProfileEntity[],
  config: TagConfig
): Promise<TagOutcome> => {
  if (entities.length === 0) return { ok: true, categories: {}, corrections: [] };

  const prompt = buildTagPrompt({ entities });

  const attempt = async (): Promise<
    { ok: true; result: TagResult } | { ok: false; error: string; retryable: boolean }
  > => {
    let response: Response;
    try {
      response = await fetch("/api/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, prompt }),
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "请求失败",
        retryable: true,
      };
    }

    const data = (await response.json().catch(() => null)) as
      | { success: true; raw: string }
      | { success: false; error: string; retryable?: boolean }
      | null;

    if (!data) {
      return { ok: false, error: `服务端返回异常（HTTP ${response.status}）`, retryable: true };
    }
    if (!data.success) {
      return { ok: false, error: data.error, retryable: data.retryable ?? false };
    }

    const payload = parseModelJson(data.raw);
    if (payload === null) {
      return {
        ok: false,
        error: "模型返回的内容不是合法 JSON（常见原因是输出被长度上限截断）",
        retryable: true,
      };
    }

    return { ok: true, result: validateTagResult(payload, entities) };
  };

  let outcome = await attempt();
  if (!outcome.ok && outcome.retryable) {
    await sleep(1200);
    outcome = await attempt();
  }

  return outcome.ok
    ? { ok: true, categories: outcome.result.categories, corrections: outcome.result.corrections }
    : { ok: false, error: outcome.error };
};
