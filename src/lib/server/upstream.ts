/**
 * 调上游 LLM 时的中断控制。
 *
 * 原来只有 `/api/match` 一条链路上有超时，polish / grammar / resume-import
 * 三条都是裸 `fetch`：上游一卡，连接就无限期挂着。实测用一个只收请求、
 * 永不响应的 tarpit 服务验证过 —— 客户端 25 秒放弃之后，服务端仍在等，
 * 直到上游被强杀才报 `SocketError: other side closed`。
 *
 * 另外，浏览器取消请求（润色弹窗有 AbortController）也**不会**传到上游：
 * 用户点了取消，服务端照样把那次生成跑完，token 照烧。所以这里把两个信号
 * 合并：超时是一道闸，客户端断开是另一道。
 */

/** 单次上游调用的时限。60s 足够一次完整生成，又不至于让连接无限期挂着 */
export const UPSTREAM_TIMEOUT_MS = 60_000;

/**
 * 构造上游请求的 `signal`。
 *
 * `AbortSignal.any` 在任一路信号触发时中止 —— 超时或客户端断开，谁先到算谁。
 * 没有客户端信号时退化为纯超时。
 */
export const upstreamSignal = (
  clientSignal?: AbortSignal,
  timeoutMs: number = UPSTREAM_TIMEOUT_MS
): AbortSignal =>
  clientSignal
    ? AbortSignal.any([clientSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

/**
 * 请求是不是被这两道闸掐断的 —— 用来把「超时/取消」和「上游报错」分开报，
 * 否则用户看到的会是 `The operation was aborted` 这种无从下手的措辞。
 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

export const abortMessage = (clientSignal?: AbortSignal): string =>
  clientSignal?.aborted ? "请求已取消" : `上游超过 ${UPSTREAM_TIMEOUT_MS / 1000} 秒未响应，已中止`;
