import { createFileRoute } from "@tanstack/react-router";
import { AI_MODEL_CONFIGS, isSupportedModelType, resolveModel } from "@/config/ai";
import { guardRequest } from "@/lib/server/rateLimit";
import { abortMessage, isAbortError, upstreamSignal } from "@/lib/server/upstream";

/**
 * 错别字与标点校对。
 *
 * 响应体是**上游的原始信封**（`choices[0].message.content` 里才是模型输出的
 * JSON 字符串），客户端自己去取那一层。这是既有契约，接口没有把它拍平 ——
 * 拍平会同时改掉客户端的解析，属于另一件事。
 */

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return { message: fallback };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return { message: data.error?.message || data.message || fallback, code: data.error?.code };
  } catch {
    return { message: raw.slice(0, 300) };
  }
};

const badRequest = (error: string) => Response.json({ error }, { status: 400 });

const SYSTEM_PROMPT = `你是一个专业的中文简历校对助手。你的任务是**仅**找出简历中的**错别字**和**标点符号错误**。

**严格禁止**：
1. ❌ **禁止**提供任何风格、语气、润色或改写建议。如果句子在语法上是正确的（即使读起来不够优美），也**绝对不要**报错。
2. ❌ **禁止**报告"无明显错误"或类似的信息。如果没有发现错别字或标点错误，"errors" 数组必须为空。
3. ❌ **禁止**对专业术语进行过度纠正，除非通过上下文非常确定是打字错误。

**仅检查以下两类错误**：
1. ✅ **错别字**：例如将"作为"写成"做为"，将"经理"写成"经里"。
2. ✅ **严重标点错误**：仅报告重复标点（如"，，"）或完全错误的符号位置。

**重要例外（绝不报错）**：
- ❌ **忽略中英文标点混用**：在技术简历中，中文内容使用英文标点（如使用英文逗号, 代替中文逗号，或使用英文句点. 代替中文句号）是**完全接受**的风格。**绝对不要**报告此类"错误"。
- ❌ **忽略空格使用**：不要报告中英文之间的空格遗漏或多余。

返回格式示例（JSON）：
{
  "errors": [
    {
      "context": "包含错误的完整句子（必须是原文）",
      "text": "具体的错误部分（必须是原文中实际存在的字符串）",
      "suggestion": "仅包含修正后的词汇或片段（**不要**返回整句，除非整句都是错误的）",
      "reason": "错别字 / 标点错误",
      "type": "spelling"
    }
  ]
}

再次强调：**只找错别字和标点错误，不要做任何润色！**`;

export const Route = createFileRoute("/api/grammar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = guardRequest(request, "ai");
        if (limited) return limited;

        let body: { apiKey?: string; model?: string; content?: string; modelType?: unknown };
        try {
          body = await request.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : "无法解析";
          return badRequest(`请求体解析失败：${message}`);
        }

        const { apiKey, model, content } = body;
        if (!isSupportedModelType(body.modelType)) {
          return badRequest(`不支持的模型类型：${String(body.modelType)}`);
        }
        if (!apiKey?.trim()) return badRequest("未配置 API Key");
        if (!content?.trim()) return badRequest("缺少要校对的内容");

        const modelConfig = AI_MODEL_CONFIGS.deepseek;

        try {
          const response = await fetch(modelConfig.url, {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: resolveModel(model),
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content },
              ],
            }),
            signal: upstreamSignal(request.signal),
          });

          const raw = await response.text();
          if (!response.ok) {
            return Response.json(
              { error: parseUpstreamError(raw, `Upstream API error: ${response.status}`) },
              { status: response.status }
            );
          }

          let data: unknown;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            return Response.json(
              { error: "上游返回的不是合法 JSON" },
              { status: 502 }
            );
          }

          return Response.json(data);
        } catch (error) {
          if (isAbortError(error)) {
            return Response.json({ error: abortMessage(request.signal) }, { status: 504 });
          }
          const message = error instanceof Error ? error.message : "未知错误";
          console.error("Grammar check error:", error);
          return Response.json({ error: `校对请求失败：${message}` }, { status: 502 });
        }
      },
    },
  },
});
