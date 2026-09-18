import { AI_MODEL_CONFIGS, resolveModel, type AIModelType } from "@/config/ai";
import { LLM_PARAMS } from "@/lib/match/buildMatchPrompt";
import { abortMessage, isAbortError, upstreamSignal } from "./upstream";

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
  model?: string;
  prompt: string;
  /** 超时毫秒数，默认 60s */
  timeoutMs?: number;
  /** 客户端断开信号 —— 一起传进来，用户取消时不至于还在烧 token */
  signal?: AbortSignal;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type LLMCallResult =
  | { ok: true; raw: string; modelId: string; usage?: LLMUsage }
  | { ok: false; error: string; retryable: boolean };

/**
 * 单次回答的长度上限。
 *
 * 显式写出来，因为原本这是上游的默认值而**我们撞上过** —— fin-01 那份 20 条
 * 经历的档案曾把 JSON 截断在 8192。写出来之后天花板是我们知道的东西，
 * 而不是上游某天改动的结果；配合下面的 `finish_reason` 检查，
 * 撞顶会变成一次响亮的可重试失败，而不是「解析失败但不知道为什么」。
 */
const MAX_COMPLETION_TOKENS = 8192;

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
export const resolveModelId = (input: Pick<LLMCallInput, "model">): string =>
  resolveModel(input.model);

export const callLLM = async (input: LLMCallInput): Promise<LLMCallResult> => {
  const { modelType, apiKey, prompt, timeoutMs } = input;

  const modelConfig = AI_MODEL_CONFIGS[modelType];
  if (!modelConfig) return { ok: false, error: "未知的模型类型", retryable: false };
  // 本地先拦一道。否则拿 `Bearer undefined` 打上游，用户收到的是
  // 「Your api key: ****ined is invalid」—— 完全看不出是没配 key
  if (!apiKey?.trim()) return { ok: false, error: "未配置 API Key", retryable: false };
  if (!prompt?.trim()) return { ok: false, error: "缺少分析内容", retryable: false };

  const modelId = resolveModelId(input);

  try {
    const response = await fetch(modelConfig.url, {
      method: "POST",
      headers: modelConfig.headers(apiKey),
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: LLM_PARAMS.temperature,
        seed: LLM_PARAMS.seed,
        stream: false,
        response_format: { type: "json_object" },
        max_tokens: MAX_COMPLETION_TOKENS,
      }),
      signal: upstreamSignal(input.signal, timeoutMs),
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
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const choice = data.choices?.[0];

    // 撞上长度上限时 content 是半截的。以前的路径不看 finish_reason，
    // 截断只要碰巧还能解析就会**静静落库** —— 用户拿到的是一份缺了一半的排序
    if (choice?.finish_reason === "length") {
      return {
        ok: false,
        error: `输出超过 ${MAX_COMPLETION_TOKENS} token 上限被截断`,
        retryable: true,
      };
    }

    const content = choice?.message?.content ?? "";

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
    if (isAbortError(error)) {
      return { ok: false, error: abortMessage(input.signal), retryable: true };
    }
    const message = error instanceof Error ? error.message : "请求失败";
    return { ok: false, error: message, retryable: true };
  }
};
