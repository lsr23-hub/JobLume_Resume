/**
 * 按来源 IP 的固定窗口限流。
 *
 * 为什么需要：`/api/*` 全部匿名可调用，而且会拿着请求里的 key 向 LLM 上游
 * 发真实请求。没有限流时它就是一个开放转发层 —— 谁都能写脚本拿它刷带宽、
 * 刷上游配额。图片代理同理，它还会替调用方去取任意公网地址。
 *
 * 三条刻意的取舍：
 *
 * 1. **进程内存实现**。多实例部署时每个实例各算各的，实际限额是 N 倍。
 *    要精确得用共享存储（Redis），本轮不引入 —— 单实例或按 IP 粘滞的部署够用。
 * 2. **取不到 IP 时所有请求共用一个桶**。这不是保守，是防伪造：直连部署下
 *    `X-Forwarded-For` 完全由客户端控制，信它等于没限流。所以默认**不信**
 *    任何转发头，只有显式设了 `TRUST_PROXY=1`（确认自己跑在反向代理后面）
 *    才去读。代价是忘了设时全站共用一个额度 —— 会立刻被用户发现，而不是
 *    静默失效。
 * 3. 读转发头时取**最后一跳**。代理会把自己看到的地址追加到末尾，
 *    攻击者预置的第一段因此被挤到前面，取末尾拿到的才是真实来源。
 */

const WINDOW_MS = 60_000;

/**
 * 各桶的每分钟额度。
 *
 * - `ai`：会真花钱，收得最紧
 * - `image`：只是取图
 * - `saves`：存档读写。**额度必须宽松** —— 它承载的是正常使用（导入一个带几十张图的
 *   备份就会连着发几十个请求），限制太紧会把用户自己的正常操作挡住。这里挡的是
 *   脚本刷盘，不是人
 */
export type BucketName = "ai" | "image" | "saves";

const LIMITS: Record<BucketName, number> = {
  ai: 30,
  image: 120,
  saves: 300,
};

/** 桶数量的上限。过期条目在这个阈值之上才清理，避免每次请求都扫一遍 */
const MAX_BUCKETS = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 用 forEach 而不是 for...of —— tsconfig 的 target 是 ES5，Map 迭代过不了类型检查 */
const sweep = (now: number): void => {
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) buckets.delete(key);
  });
};

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/** 记一次请求并判断是否超限 */
export const checkRateLimit = (
  key: string,
  limit: number = LIMITS.ai,
  windowMs: number = WINDOW_MS,
  now: number = Date.now()
): RateLimitResult => {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
};

const trustProxy = (): boolean => process.env.TRUST_PROXY === "1";

/**
 * 调用方 IP。
 *
 * 取不到就返回 `"unknown"` —— 那种情况下所有请求共用一个桶，
 * 也就是全站共用一个额度。这是默认行为，理由见文件头。
 */
export const clientIpOf = (request: Request): string => {
  if (!trustProxy()) return "unknown";

  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
};

/**
 * 路由入口处调用。超限则返回一个 429 响应，否则返回 null 让请求继续。
 *
 *   const limited = guardRequest(request, "ai");
 *   if (limited) return limited;
 */
export const guardRequest = (request: Request, bucket: BucketName): Response | null => {
  const verdict = checkRateLimit(`${bucket}:${clientIpOf(request)}`, LIMITS[bucket]);
  if (verdict.ok) return null;

  return Response.json(
    { error: `请求过于频繁，请 ${verdict.retryAfterSec} 秒后重试`, retryAfterSec: verdict.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfterSec) } }
  );
};

/** 仅供测试：清空计数 */
export const resetRateLimits = (): void => buckets.clear();
