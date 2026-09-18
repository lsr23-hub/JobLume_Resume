import { isSupportedModelType } from "@/config/ai";
import { guardRequest } from "./rateLimit";
import { callLLM } from "./llm";

/**
 * LLM 路由的公共处理器。
 *
 * 匹配与归类两条链路的请求形状完全一样，区别只在 prompt 由谁构造 —— 抽出来
 * 一份实现，两条路由各自只留一句「这是干什么的」。复制一份的话，
 * 限流、鉴权、超时、错误映射任何一处改了都会漏掉另一边。
 *
 * 约定：
 * - **prompt 由客户端构造并整段传入**，服务端只透传、不做字符串拼接 ——
 *   这样 prompt 的确定性由纯函数保证，可在单元测试里直接断言。
 * - **temperature / seed 由服务端注入**（在 `callLLM` 里），不接受客户端传值。
 */

interface LlmRouteBody {
  apiKey?: unknown;
  model?: unknown;
  modelType?: unknown;
  prompt?: unknown;
}

const badRequest = (error: string) =>
  Response.json({ success: false, error, retryable: false }, { status: 400 });

export const handleLlmRoute = async (request: Request): Promise<Response> => {
  const limited = guardRequest(request, "ai");
  if (limited) return limited;

  let body: LlmRouteBody;
  try {
    body = (await request.json()) as LlmRouteBody;
  } catch (error) {
    // 请求体不是合法 JSON 是调用方的问题，不是服务端故障
    const message = error instanceof Error ? error.message : "无法解析";
    return badRequest(`请求体解析失败：${message}`);
  }

  if (!isSupportedModelType(body.modelType)) {
    return badRequest(`不支持的模型类型：${String(body.modelType)}`);
  }
  if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return badRequest("未配置 API Key");
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return badRequest("缺少提示词");
  }

  const result = await callLLM({
    modelType: body.modelType,
    apiKey: body.apiKey,
    model: typeof body.model === "string" ? body.model : undefined,
    prompt: body.prompt,
    // 用户关掉页面就别再往下跑了
    signal: request.signal,
  });

  if (!result.ok) {
    return Response.json(
      { success: false, error: result.error, retryable: result.retryable },
      // 可重试的是上游的问题（5xx / 超时），不可重试的是调用方的问题
      { status: result.retryable ? 502 : 400 }
    );
  }

  return Response.json({ success: true, raw: result.raw, modelId: result.modelId });
};
