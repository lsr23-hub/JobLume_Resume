import { createFileRoute } from "@tanstack/react-router";
import { AI_MODEL_CONFIGS, isSupportedModelType, resolveModel } from "@/config/ai";
import { guardRequest } from "@/lib/server/rateLimit";
import { abortMessage, isAbortError, upstreamSignal } from "@/lib/server/upstream";

/**
 * 条目润色（流式）。
 *
 * 响应体是**纯文本增量**，不是 SSE 帧 —— 服务端把上游的 SSE 拆开、只取
 * `delta.content` 再拼回去，客户端直接读 body 累加。所以 `Content-Type`
 * 就该是 `text/plain`：以前写的是 `text/event-stream`，body 里却没有一个
 * `data:` 前缀，标准 SSE 消费者会静默拿到空内容。
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

const SYSTEM_PROMPT = `你是一个专业的简历优化助手。请帮助优化以下 Markdown 格式的文本，使其更加专业和有吸引力。

优化原则：
1. 使用更专业的词汇和表达方式
2. 突出关键成就和技能
3. 保持简洁清晰
4. 使用主动语气
5. 保持原有信息的完整性
6. 严格保留原有的 Markdown 格式结构（列表项保持为列表项，加粗保持加粗等）

输出强约束（必须遵守）：
1. 只能输出"润色后的正文内容"本身。
2. 禁止输出任何前言、说明、总结、附加建议。
3. 禁止出现这类引导语：如"以下是...""根据您提供...""这是...""特点：""说明：""总结："等。
4. 禁止新增与原文无关的章节标题或收尾段落。
5. 不要使用 Markdown 代码块（\`\`\`）包裹结果。
6. 若你产生了解释性内容，必须在输出前自检并删除，只保留最终正文。`;

export const Route = createFileRoute("/api/polish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = guardRequest(request, "ai");
        if (limited) return limited;

        let body: {
          apiKey?: string;
          model?: string;
          content?: string;
          modelType?: unknown;
          customInstructions?: string;
        };
        try {
          body = await request.json();
        } catch (error) {
          // 请求体不是合法 JSON 是调用方的问题，不是服务端故障 ——
          // 以前这里报 500，会把一次参数错误报成服务不可用
          const message = error instanceof Error ? error.message : "无法解析";
          return badRequest(`请求体解析失败：${message}`);
        }

        const { apiKey, model, content, customInstructions } = body;
        if (!isSupportedModelType(body.modelType)) {
          return badRequest(`不支持的模型类型：${String(body.modelType)}`);
        }
        if (!apiKey?.trim()) return badRequest("未配置 API Key");
        if (!content?.trim()) return badRequest("缺少要润色的内容");

        const modelConfig = AI_MODEL_CONFIGS.deepseek;
        const systemPrompt = customInstructions?.trim()
          ? `${SYSTEM_PROMPT}\n\n用户额外要求：\n${customInstructions.trim()}`
          : SYSTEM_PROMPT;

        try {
          const response = await fetch(modelConfig.url, {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: resolveModel(model),
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content },
              ],
              stream: true,
            }),
            signal: upstreamSignal(request.signal),
          });

          if (!response.ok) {
            const raw = await response.text();
            return Response.json(
              { error: parseUpstreamError(raw, `Upstream API error: ${response.status}`) },
              { status: response.status }
            );
          }

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              if (!response.body) {
                controller.close();
                return;
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let pending = "";

              const emit = (payload: string): boolean => {
                if (!payload || payload === "[DONE]") return true;
                const data = JSON.parse(payload) as {
                  error?: { message?: string };
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                if (data.error?.message) {
                  controller.error(new Error(data.error.message));
                  return false;
                }
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) controller.enqueue(encoder.encode(delta));
                return true;
              };

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  pending += decoder.decode(value, { stream: true });
                  const lines = pending.split(/\r?\n/);
                  pending = lines.pop() ?? "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    try {
                      if (!emit(trimmed.slice(5).trim())) return;
                    } catch (error) {
                      // 单个坏帧不该打断整条流（有些上游会夹注释行），
                      // 但要把原文记下来 —— 只打 error 对象的话，
                      // 内容少了一截却查不出是哪一帧
                      console.error("跳过无法解析的流数据块:", trimmed.slice(0, 200), error);
                    }
                  }
                }

                const tail = (pending + decoder.decode()).trim();
                if (tail.startsWith("data:")) {
                  try {
                    emit(tail.slice(5).trim());
                  } catch (error) {
                    console.error("尾部数据块解析失败:", tail.slice(0, 200), error);
                  }
                }
                controller.close();
              } catch (error) {
                console.error("Stream reading error:", error);
                controller.error(
                  isAbortError(error) ? new Error(abortMessage(request.signal)) : error
                );
              }
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        } catch (error) {
          if (isAbortError(error)) {
            return Response.json({ error: abortMessage(request.signal) }, { status: 504 });
          }
          const message = error instanceof Error ? error.message : "未知错误";
          console.error("Polish error:", error);
          return Response.json({ error: `润色请求失败：${message}` }, { status: 502 });
        }
      },
    },
  },
});
