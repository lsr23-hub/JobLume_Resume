import type { ProfileEntity } from "@/types/profile";
import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";
import type { AIModelType } from "@/config/ai";
import { buildMatchPrompt, PROMPT_VERSION, TOP_N } from "./buildMatchPrompt";
import {
  buildEntityFingerprints,
  checkCache,
  createAnalysisCache,
  type CacheVerdict,
} from "./analysisCache";
import {
  parseMatchPayload,
  validateMatchResult,
  type Correction,
} from "./validateMatchResult";

export interface MatchConfig {
  apiKey: string;
  model: string;
  modelType: AIModelType;
}

export interface AnalyzeInput {
  target: Pick<JobTarget, "company" | "position" | "jdRaw">;
  entities: ProfileEntity[];
  config: MatchConfig;
  /** 由调用方提供，保持流程可测 */
  now: string;
  /** 上次的缓存；无则传 null */
  cache: AnalysisCache | null;
  /** 上一次的分析结果，缓存命中时直接返回 */
  cachedAnalysis: MatchAnalysis | null;
  /** 忽略缓存强制重跑 */
  force?: boolean;
}

export type AnalyzeOutcome =
  | {
      ok: true;
      analysis: MatchAnalysis;
      cache: AnalysisCache;
      fromCache: boolean;
      corrections: Correction[];
    }
  | {
      ok: false;
      /** 失败原因，用于界面提示 */
      error: string;
      /** 缓存判定结果，便于界面说明「为什么不能用上次的结果」 */
      verdict: CacheVerdict;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 调用服务端分析路由，并把返回的文本解析成 JSON。
 *
 * **解析放在 attempt 里面**：JSON 解析失败（最典型的是输出撞上长度上限被截断）
 * 发生在请求成功之后，而重试原来只覆盖传输层错误 —— 这种失败一次都不会重试，
 * 用户唯一的选择是手动再点一次。放进 attempt 之后它和超时、5xx 享受同一次重试。
 */
const requestAnalysis = async (
  prompt: string,
  config: MatchConfig
): Promise<{ ok: true; payload: unknown; modelId: string } | { ok: false; error: string }> => {
  type Attempt =
    | { ok: true; payload: unknown; modelId: string }
    | { ok: false; error: string; retryable: boolean };

  const attempt = async (): Promise<Attempt> => {
    const response = await fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...config, prompt }),
    });

    const data = (await response.json().catch(() => null)) as
      | { success: true; raw: string; modelId: string }
      | { success: false; error: string; retryable?: boolean }
      | null;

    if (!data) return { ok: false, error: `服务端返回异常（HTTP ${response.status}）`, retryable: true };
    if (!data.success) return { ok: false, error: data.error, retryable: data.retryable ?? false };

    const payload = parseMatchPayload(data.raw);
    if (payload === null) {
      return {
        ok: false,
        error: "模型返回的内容不是合法 JSON（常见原因是输出被长度上限截断）",
        retryable: true,
      };
    }

    return { ok: true, payload, modelId: data.modelId };
  };

  let result = await attempt().catch((e) => ({
    ok: false as const,
    error: e instanceof Error ? e.message : "请求失败",
    retryable: true,
  }));

  // 只对可重试的错误重试一次（超时、5xx、坏 JSON）；鉴权与限流不重试
  if (!result.ok && result.retryable) {
    await sleep(1200);
    result = await attempt().catch((e) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "请求失败",
      retryable: false,
    }));
  }

  return result.ok
    ? { ok: true, payload: result.payload, modelId: result.modelId }
    : { ok: false, error: result.error };
};

/**
 * 执行匹配分析。
 *
 * 可复现性：数据未变时直接复用缓存结果，**完全不发请求**；
 * 数据变更时返回变更明细，由界面提示用户而非自动重跑。
 *
 * 降级：任何失败路径都返回 `ok: false`，调用方据此进入无标注的手动选择模式 ——
 * 生成简历的路径自始至终是「用户勾选 → 物化」，不依赖 AI 是否可用。
 */
export const analyzeMatch = async (input: AnalyzeInput): Promise<AnalyzeOutcome> => {
  const entityFingerprints = buildEntityFingerprints(input.entities);
  const verdict = checkCache(input.cache, {
    entityFingerprints,
    jdRaw: input.target.jdRaw,
    modelId: input.config.model,
  });

  if (!input.force && verdict.reusable && input.cachedAnalysis) {
    return {
      ok: true,
      analysis: input.cachedAnalysis,
      cache: input.cache as AnalysisCache,
      fromCache: true,
      corrections: [],
    };
  }

  const prompt = buildMatchPrompt({
    jdRaw: input.target.jdRaw,
    company: input.target.company,
    position: input.target.position,
    entities: input.entities,
  });

  const response = await requestAnalysis(prompt, input.config);
  if (!response.ok) return { ok: false, error: response.error, verdict };

  const { analysis, corrections } = validateMatchResult(response.payload, {
    entities: input.entities,
    // 校验每条要求的原文依据要用到它
    jdRaw: input.target.jdRaw,
    modelId: response.modelId,
    promptVersion: PROMPT_VERSION,
    analyzedAt: input.now,
    topN: TOP_N,
  });

  return {
    ok: true,
    analysis,
    cache: createAnalysisCache({
      entityFingerprints,
      jdRaw: input.target.jdRaw,
      modelId: response.modelId,
      analyzedAt: input.now,
    }),
    fromCache: false,
    corrections,
  };
};
