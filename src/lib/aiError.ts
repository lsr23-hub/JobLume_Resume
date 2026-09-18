/**
 * 从失败响应里取出可读的原因。
 *
 * 这套后端在失败时把**上游的原话**放在 `error` 里（`Authentication Fails,
 * Your api key ... is invalid`），字段形状有两种：上游透传时是
 * `{ error: { message } }`，本地校验失败时是 `{ error: "..." }`。
 *
 * 之前 grammar 那边只写了 `请求失败（HTTP ${status}）`，把服务端已经准备好的
 * 诊断信息丢掉了 —— 用户看到 401 却不知道是 key 没填还是填错了。
 */

const nonEmpty = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** 解析响应体的 JSON，取其中的错误说明；取不到返回 null */
export const extractErrorMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const { error, message } = data as { error?: unknown; message?: unknown };

  const direct = nonEmpty(error);
  if (direct) return direct;

  if (error && typeof error === "object") {
    const fromError = nonEmpty((error as { message?: unknown }).message);
    if (fromError) return fromError;
  }

  return nonEmpty(message);
};

/**
 * 读一个失败响应，给出给用户看的文案。
 *
 * 响应体可能不是 JSON（网关返回的 HTML 错误页），也可能为空 ——
 * 两种情况都退回带状态码的兜底文案，而不是抛解析异常。
 */
export const readErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  let rawText = "";
  try {
    rawText = await response.text();
  } catch {
    return fallback;
  }

  if (rawText) {
    try {
      const message = extractErrorMessage(JSON.parse(rawText));
      if (message) return message;
    } catch {
      // 不是 JSON：截一段原文，至少能看到网关说了什么
      const snippet = rawText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (snippet) return `${fallback}：${snippet.slice(0, 160)}`;
    }
  }

  if (response.status === 401 || response.status === 403) {
    return "认证失败，请检查 API Key 是否正确。";
  }
  if (response.status === 429) {
    return "请求过于频繁，请稍后再试。";
  }
  return fallback;
};
