import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientIpOf, guardRequest, resetRateLimits } from "./rateLimit";

/**
 * 限流的单测。
 *
 * 这里每一条都对应一个具体的绕过手法 —— 限流写错的方式不是「限得太松」，
 * 而是「能被一条构造出来的请求头绕过去」。
 */

const req = (headers: Record<string, string> = {}): Request =>
  new Request("https://example.com/api/match", { method: "POST", headers });

const originalTrust = process.env.TRUST_PROXY;

beforeEach(() => {
  resetRateLimits();
  delete process.env.TRUST_PROXY;
});

afterEach(() => {
  if (originalTrust === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = originalTrust;
});

describe("checkRateLimit", () => {
  it("窗口内前 N 次放行，第 N+1 次拒绝并给出等待秒数", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("k", 3, 60_000, t0).ok).toBe(true);
    }
    const blocked = checkRateLimit("k", 3, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
  });

  it("窗口一过就重置", () => {
    expect(checkRateLimit("k", 1, 60_000, 0).ok).toBe(true);
    expect(checkRateLimit("k", 1, 60_000, 0).ok).toBe(false);
    expect(checkRateLimit("k", 1, 60_000, 60_000).ok).toBe(true);
  });

  it("不同 key 各算各的", () => {
    expect(checkRateLimit("a", 1).ok).toBe(true);
    expect(checkRateLimit("b", 1).ok).toBe(true);
    expect(checkRateLimit("a", 1).ok).toBe(false);
  });

  it("等待秒数不会算成 0 —— 那会让客户端原地重试", () => {
    const t0 = 5_000;
    checkRateLimit("k", 0, 60_000, t0);
    expect(checkRateLimit("k", 0, 60_000, t0).retryAfterSec).toBeGreaterThanOrEqual(1);
  });
});

describe("clientIpOf —— 默认不信任何转发头", () => {
  it("没设 TRUST_PROXY 时，伪造的转发头不生效", () => {
    // 直连部署下这个头完全由客户端控制，信它等于没限流
    expect(clientIpOf(req({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
    expect(clientIpOf(req({ "cf-connecting-ip": "1.2.3.4" }))).toBe("unknown");
    expect(clientIpOf(req({ "x-real-ip": "1.2.3.4" }))).toBe("unknown");
  });

  it("取不到时统一是 unknown —— 全站共用一个额度，而不是各拿一个新额度", () => {
    expect(clientIpOf(req())).toBe("unknown");
  });
});

describe("clientIpOf —— TRUST_PROXY=1 时读最后一跳", () => {
  beforeEach(() => {
    process.env.TRUST_PROXY = "1";
  });

  it("X-Forwarded-For 取末尾那段（代理追加的才是真实来源）", () => {
    // 攻击者预置的 9.9.9.9 被挤到前面，不能采信
    expect(clientIpOf(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("单跳时就是客户端地址", () => {
    expect(clientIpOf(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("优先用平台专有头（它们由边缘节点写入，客户端改不了）", () => {
    expect(
      clientIpOf(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }))
    ).toBe("203.0.113.7");
    expect(clientIpOf(req({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "9.9.9.9" }))).toBe(
      "203.0.113.8"
    );
  });

  it("空白与多余逗号不产生空 key", () => {
    expect(clientIpOf(req({ "x-forwarded-for": " 9.9.9.9 , , 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(clientIpOf(req({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});

describe("guardRequest", () => {
  it("未超限返回 null，让路由继续", () => {
    expect(guardRequest(req(), "ai")).toBeNull();
  });

  it("超限返回 429 且带 Retry-After", async () => {
    let response: Response | null = null;
    for (let i = 0; i < 31 && !response; i += 1) {
      response = guardRequest(req(), "ai");
    }
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(((await response!.json()) as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
  });

  it("两个桶互不占用额度 —— 刷图片不会把 AI 请求挤掉", () => {
    for (let i = 0; i < 130; i += 1) guardRequest(req(), "image");
    expect(guardRequest(req(), "image")?.status).toBe(429);
    expect(guardRequest(req(), "ai")).toBeNull();
  });
});
