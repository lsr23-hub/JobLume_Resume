import type { ProfileEntity } from "@/types/profile";
import { callLLM, type LLMUsage } from "@/lib/server/llm";
import type { AIModelType } from "@/config/ai";
import type { EvalCase } from "./types";

/**
 * 传输层：把「一次模型调用」抽象成可替换的东西。
 *
 * 真实调用与 mock 都走同一条路：拦截 `fetch` 到 `/api/match`，
 * 让 `analyzeMatch`（生产入口）原封不动地跑起来。
 * 不这么做的话，测的就是「评测框架自己拼的一套流程」。
 */

export interface Transport {
  label: string;
  modelType: string;
  modelId: string;
  complete: (prompt: string) => Promise<{ raw: string; usage?: LLMUsage }>;
}

export interface RealTransportConfig {
  modelType: AIModelType;
  modelId: string;
  apiKey: string;
}

export const realTransport = (config: RealTransportConfig): Transport => ({
  label: `${config.modelType}/${config.modelId}`,
  modelType: config.modelType,
  modelId: config.modelId,
  complete: async (prompt) => {
    const result = await callLLM({
      modelType: config.modelType,
      apiKey: config.apiKey,
      model: config.modelId,
      prompt,
    });
    if (!result.ok) throw new Error(result.error);
    return { raw: result.raw, usage: result.usage };
  },
});

// ─────────────────────────────────────────────────────────────
// Mock：不花钱验证框架本身
// ─────────────────────────────────────────────────────────────

/**
 * - `oracle`：完全照金标准答。指标应当全绿
 * - `noisy`：按 id 稳定地翻掉一部分判定、打乱一部分排序。用来验证指标真的能抓错
 * - `unstable`：每次调用的翻转集合都不同。用来验证稳定性指标（重跑翻转率）
 */
export type MockMode = "oracle" | "noisy" | "unstable";

/** 稳定哈希，让 noisy 模式可复现 —— 每次跑翻同几条 */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/**
 * 摘一句原文充当 evidence。
 *
 * 校验在 `title + subtitle + dateRange + description + skills + metrics`
 * 里找这段文字，所以**描述为空时要退到标题** —— 荣誉、语言这类条目本来就
 * 只有标题，只从描述里取会造出空证据，被校验自动推翻，看起来像模型判错了。
 */
const quoteFrom = (entity: ProfileEntity): string => {
  const text = entity.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text) {
    const first = text.split(/[。；;]/)[0] ?? text;
    if (first.trim()) return first.trim().slice(0, 40);
  }
  return (entity.subtitle || entity.title).trim().slice(0, 40);
};

/**
 * 造一份「模型会返回的」payload。
 *
 * - `oracle`：完全照金标准答，用来验证指标管线能算出满分
 * - `noisy`：按 id 稳定地翻掉一部分判定，用来验证指标真的能抓出错
 */
export const createMockTransport = (evalCase: EvalCase, mode: MockMode = "oracle"): Transport => {
  const entities = Object.values(evalCase.profile?.entities ?? {});
  const gold = evalCase.gold;
  let callIndex = 0;

  return {
    label: `mock/${mode}`,
    modelType: "mock",
    modelId: `mock-${mode}`,
    complete: async () => {
      // unstable 每调一次换一套翻转集合 —— 模拟模型自身的抖动
      callIndex += 1;

      const shouldFlip = (id: string): boolean => {
        if (mode === "noisy") return hash(id) % 5 === 0;
        if (mode === "unstable") return hash(`${id}#${callIndex}`) % 5 === 0;
        return false;
      };

      const judged = entities.map((entity) => {
        const g = gold.entities[entity.id];
        let level = g?.level ?? "not_recommended";
        if (shouldFlip(entity.id)) {
          level = level === "recommended" ? "not_recommended" : "recommended";
        }

        // noisy 顺带打乱一部分排序，让排序指标也被触发
        const jitter = mode === "noisy" && hash(`rank${entity.id}`) % 3 === 0 ? -1 : 0;

        return {
          entity,
          level,
          relevance: (g?.relevance ?? 0) + jitter,
          flipped: level !== (g?.level ?? "not_recommended"),
        };
      });

      // rankedIds 由数组顺序决定：相关度降序，同分按 id 稳定排序
      const ordered = [...judged].sort(
        (a, b) => b.relevance - a.relevance || a.entity.id.localeCompare(b.entity.id)
      );

      return {
        raw: JSON.stringify({
          // oracle 直接给出金标准里的缺失项，用来验证召回指标算得对。
          // prompt v5 起 coverage 由 requirements 派生，所以这里必须给要求项 ——
          // 继续写旧的 summary.coverage 会被校验器忽略，missingRecall 直接变 0，
          // 框架自检就失效了。
          // sourceQuote 留空：mock 没有 JD 原文可引，留空即「无原文依据」，不会被清。
          requirements:
            mode === "oracle"
              ? gold.missingSkills.map((skill, index) => ({
                  id: `r${index + 1}`,
                  text: skill,
                  keys: [skill],
                  kind: "must",
                  status: "missing",
                  entityIds: [],
                  sourceQuote: "",
                }))
              : [],
          items: ordered.map(({ entity, level, flipped }) => ({
            id: entity.id,
            level,
            reason: flipped
              ? `[mock 翻转] ${level === "recommended" ? "与该岗位相关" : "与该岗位要求无关"}`
              : (gold.entities[entity.id]?.reason ?? "与该岗位相关"),
            evidence: level === "not_recommended" ? quoteFrom(entity) : "",
            matchedSkills: entity.skills ?? [],
            missingSkills: [],
          })),
          summary: {
            recommendedCount: judged.filter((j) => j.level === "recommended").length,
            advice: "mock",
          },
        }),
      };
    },
  };
};

// ─────────────────────────────────────────────────────────────
// fetch 桥
// ─────────────────────────────────────────────────────────────

const MATCH_ENDPOINT = "/api/match";

/**
 * 把 `fetch("/api/match")` 接到 `transport`，返回还原函数。
 *
 * 返回的响应体与真实路由一致（`{success, raw, modelId}`），
 * 所以 `analyzeMatch` 里那条「失败重试一次」的分支不受影响。
 */
/** 桥接期间记录到的一次调用，供成本指标与失败分析使用 */
export interface BridgedCall {
  promptChars: number;
  outputChars: number;
  elapsedMs: number;
  usage?: LLMUsage;
  raw: string;
  error?: string;
}

export interface MatchFetchBridge {
  /** 本次桥接期间发生的全部调用。缓存命中时应当为空数组 */
  calls: BridgedCall[];
  restore: () => void;
}

export const installMatchFetchBridge = (transport: Transport): MatchFetchBridge => {
  const original = globalThis.fetch;
  const calls: BridgedCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith(MATCH_ENDPOINT)) return original(input as RequestInfo, init);

    const body = JSON.parse(String(init?.body ?? "{}")) as { prompt: string };
    const started = Date.now();

    try {
      const { raw, usage } = await transport.complete(body.prompt);
      calls.push({
        promptChars: body.prompt.length,
        outputChars: raw.length,
        elapsedMs: Date.now() - started,
        usage,
        raw,
      });
      return Response.json({ success: true, raw, modelId: transport.modelId, usage });
    } catch (error) {
      const message = (error as Error).message;
      calls.push({
        promptChars: body.prompt.length,
        outputChars: 0,
        elapsedMs: Date.now() - started,
        raw: "",
        error: message,
      });
      return Response.json(
        { success: false, error: message, retryable: false },
        { status: 502 }
      );
    }
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
};
