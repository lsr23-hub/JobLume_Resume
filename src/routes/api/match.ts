import { createFileRoute } from "@tanstack/react-router";
import { AI_MODEL_CONFIGS, type AIModelType } from "@/config/ai";
import { LLM_PARAMS } from "@/lib/match/buildMatchPrompt";
import {
  formatGeminiErrorMessage,
  getGeminiModelInstance,
} from "@/lib/server/gemini";

/**
 * LLM 匹配分析。
 *
 * 与上游其他 AI 路由的差异：
 * - **prompt 由客户端构造并整段传入** —— 服务端只做透传，不参与字符串拼接。
 *   这样 prompt 的确定性由纯函数保证，可在客户端单元测试中直接断言。
 * - **temperature / seed 由服务端注入** —— 不接受客户端传值，
 *   防止前端误传破坏可复现性。
 */

interface MatchRequest {
  apiKey: string;
  model: string;
  modelType: AIModelType;
  apiEndpoint?: string;
  /** 由客户端的 buildMatchPrompt() 生成的完整提示词 */
  prompt: string;
}

const parseUpstreamError = (raw: string, fallback: string) => {
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

export const Route = createFileRoute("/api/match")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { apiKey, model, modelType, apiEndpoint, prompt } =
            (await request.json()) as MatchRequest;

          const modelConfig = AI_MODEL_CONFIGS[modelType];
          if (!modelConfig) {
            return Response.json({ success: false, error: "未知的模型类型" }, { status: 400 });
          }
          if (!prompt?.trim()) {
            return Response.json({ success: false, error: "缺少分析内容" }, { status: 400 });
          }

          const resolvedModel = modelConfig.requiresModelId
            ? model
            : (model || modelConfig.defaultModel || "");

          // Gemini 走官方 SDK（与上游 /api/polish 一致）
          if (modelType === "gemini") {
            try {
              const instance = getGeminiModelInstance({
                apiKey,
                model: resolvedModel,
                generationConfig: {
                  temperature: LLM_PARAMS.temperature,
                },
              });
              const result = await instance.generateContent(prompt);
              return Response.json({
                success: true,
                raw: result.response.text(),
                modelId: resolvedModel,
              });
            } catch (error) {
              return Response.json(
                { success: false, error: formatGeminiErrorMessage(error), retryable: false },
                { status: 502 }
              );
            }
          }

          // 其余走 OpenAI 兼容的 /chat/completions
          const response = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: resolvedModel,
              messages: [{ role: "user", content: prompt }],
              temperature: LLM_PARAMS.temperature,
              seed: LLM_PARAMS.seed,
              stream: false,
              response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(60_000),
          });

          if (!response.ok) {
            const raw = await response.text();
            return Response.json(
              {
                success: false,
                error: parseUpstreamError(
                  raw,
                  `上游返回 ${response.status} ${response.statusText}`
                ),
                // 429 / 401 / 403 重试无意义
                retryable: response.status >= 500,
              },
              { status: response.status }
            );
          }

          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.message?.content ?? "";

          if (!content.trim()) {
            return Response.json(
              { success: false, error: "模型返回了空内容", retryable: true },
              { status: 502 }
            );
          }

          return Response.json({ success: true, raw: content, modelId: resolvedModel });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "匹配分析请求失败";
          return Response.json({ success: false, error: message, retryable: true }, { status: 500 });
        }
      },
    },
  },
});
