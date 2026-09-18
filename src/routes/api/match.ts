import { createFileRoute } from "@tanstack/react-router";
import type { AIModelType } from "@/config/ai";
import { callLLM } from "@/lib/server/llm";

/**
 * LLM 匹配分析。
 *
 * 与上游其他 AI 路由的差异：
 * - **prompt 由客户端构造并整段传入** —— 服务端只做透传，不参与字符串拼接。
 *   这样 prompt 的确定性由纯函数保证，可在客户端单元测试中直接断言。
 * - **temperature / seed 由服务端注入** —— 不接受客户端传值，
 *   防止前端误传破坏可复现性。
 *
 * 请求构造本身在 `@/lib/server/llm` —— 评测框架跑的是同一份实现。
 */

interface MatchRequest {
  apiKey: string;
  model: string;
  modelType: AIModelType;
  /** 由客户端的 buildMatchPrompt() 生成的完整提示词 */
  prompt: string;
}

import { guardRequest } from "@/lib/server/rateLimit";

export const Route = createFileRoute("/api/match")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = guardRequest(request, "ai");
        if (limited) return limited;

        try {
          const { apiKey, model, modelType, prompt } = (await request.json()) as MatchRequest;

          const result = await callLLM({
            modelType,
            apiKey,
            model,
            prompt,
            // 用户关掉页面就别再往下跑了
            signal: request.signal,
          });

          if (!result.ok) {
            return Response.json(
              { success: false, error: result.error, retryable: result.retryable },
              { status: result.retryable ? 502 : 400 }
            );
          }

          return Response.json({
            success: true,
            raw: result.raw,
            modelId: result.modelId,
          });
        } catch (error) {
          // 走到这里基本都是请求体不是合法 JSON —— 那是调用方的问题，不是服务端故障
          const message = error instanceof Error ? error.message : "请求体解析失败";
          return Response.json(
            { success: false, error: `请求体解析失败：${message}`, retryable: false },
            { status: 400 }
          );
        }
      },
    },
  },
});
