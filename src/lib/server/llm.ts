import { AI_MODEL_CONFIGS, type AIModelType } from "@/config/ai";
import { LLM_PARAMS } from "@/lib/match/buildMatchPrompt";
import { formatGeminiErrorMessage, getGeminiModelInstance } from "./gemini";

/**
 * 调用大模型，返回原始文本。
 *
 * 从 `/api/match` 的路由处理函数里抽出来 —— 评测框架要跑的是**同一套请求构造**，
 * 复制一份就变成「测的是另一个系统」。`temperature` / `seed` 在这里注入，
 * 不接受调用方传值，防止误传破坏可复现性。
 */

export interface LLMCallInput {
  modelType: AIModelType;
  apiKey: string;
  /** 需要 modelId 的提供方必填 */
  model?: string;
  apiEndpoint?: string;
  prompt: string;
  /** 超时毫秒数，默认 60s */
  timeoutMs?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type LLMCallResult =
  | { ok: true; raw: string; modelId: string; usage?: LLMUsage }
  | { ok: false; error: string; retryable: boolean };

const parseUpstreamError = (raw: string, fallback: string): string => {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return data.error?.message || data.message || fallback;
  } catch {
    return raw.slice(0, 300);
  }
};

/** 该提供方这次实际会用的模型名 */
export const resolveModelId = (input: Pick<LLMCallInput, "modelType" | "model">): string => {
  const config = AI_MODEL_CONFIGS[input.modelType];
  if (!config) return "";
  return config.requiresModelId ? input.model || "" : input.model || config.defaultModel || "";
};

export const callLLM = async (input: LLMCallInput): Promise<LLMCallResult> => {
  const { modelType, apiKey, apiEndpoint, prompt, timeoutMs = 60_000 } = input;

  const modelConfig = AI_MODEL_CONFIGS[modelType];
  if (!modelConfig) return { ok: false, error: "未知的模型类型", retryable: false };
  if (!prompt?.trim()) return { ok: false, error: "缺少分析内容", retryable: false };

  const modelId = resolveModelId(input);

  if (modelType === "gemini") {
    try {
      const instance = getGeminiModelInstance({
        apiKey,
        model: modelId,
        generationConfig: { temperature: LLM_PARAMS.temperature },
      });
      const result = await instance.generateContent(prompt);
      const meta = result.response.usageMetadata;
      return {
        ok: true,
        raw: result.response.text(),
        modelId,
        usage: meta
          ? {
              promptTokens: meta.promptTokenCount ?? 0,
              completionTokens: meta.candidatesTokenCount ?? 0,
              totalTokens: meta.totalTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      return { ok: false, error: formatGeminiErrorMessage(error), retryable: false };
    }
  }

  try {
    const response = await fetch(modelConfig.url(apiEndpoint), {
      method: "POST",
      headers: modelConfig.headers(apiKey),
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: LLM_PARAMS.temperature,
        seed: LLM_PARAMS.seed,
        stream: false,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const raw = await response.text();
      return {
        ok: false,
        error: parseUpstreamError(raw, `上游返回 ${response.status} ${response.statusText}`),
        // 429 / 401 / 403 重试无意义
        retryable: response.status >= 500,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = data.choices?.[0]?.message?.content ?? "";

    if (!content.trim()) return { ok: false, error: "模型返回了空内容", retryable: true };
    return {
      ok: true,
      raw: content,
      modelId,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求失败";
    return { ok: false, error: message, retryable: true };
  }
};
