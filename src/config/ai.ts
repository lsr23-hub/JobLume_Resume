/**
 * AI 服务商配置。
 *
 * **只保留 DeepSeek 一条通道。** 原先还支持豆包 / OpenAI 兼容端点 / Gemini，
 * 四条通道各自要维护一套请求头、错误格式与前端表单，而实际只用到一条 ——
 * PDF 简历导入是唯一真正依赖别家能力（识图）的地方，DeepSeek 现已支持识图，
 * 这个理由也消失了。
 *
 * 因此这里不再有「服务商」这个概念：端点固定，模型名可调。
 */

export type AIModelType = "deepseek";

/**
 * 默认模型。
 *
 * `deepseek-chat` 同时具备识图能力（PDF 简历导入走它），所以不需要单独
 * 指定一个视觉模型。实测 `deepseek-flash`、`deepseek-v4-flash-vision-exp`
 * 也能读图，但 `deepseek-v4-flash-vision-exp` 是推理模型，`content` 常为空、
 * 内容落在 `reasoning_content` 里，当前解析逻辑取不到。
 */
export const DEFAULT_MODEL = "deepseek-chat";

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/chat/completions";

export interface AIModelConfig {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
}

export const AI_MODEL_CONFIGS: Record<AIModelType, AIModelConfig> = {
  deepseek: {
    url: DEEPSEEK_ENDPOINT,
    headers: (apiKey: string) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }),
  },
};

/**
 * 请求体里的服务商字段校验。
 *
 * 前端可能还留着旧版本发来的 `modelType`（比如 "gemini"），
 * 这种请求要明确拒掉并给 400，而不是拿着一个不存在的通道往下走。
 */
export const isSupportedModelType = (value: unknown): value is AIModelType =>
  value === "deepseek";

/** 解析实际使用的模型名：请求里给了就用，否则用默认 */
export const resolveModel = (model?: string): string => model?.trim() || DEFAULT_MODEL;
