import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl } from "./urlGuard";

/**
 * 出站 URL 准入的单测。
 *
 * 这个函数是 `/api/proxy/image` 唯一的防线，而那个端点匿名可访问 ——
 * 所以每一条拒绝都要有测试钉住，别哪天顺手放宽了没人发现。
 */

const blocked = (raw: string): string => {
  const v = assertPublicHttpUrl(raw);
  return v.ok ? "" : v.reason;
};

describe("assertPublicHttpUrl —— 放行", () => {
  it("普通公网图片地址", () => {
    const v = assertPublicHttpUrl("https://example.com/a.png");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.url.hostname).toBe("example.com");
  });

  it("带端口、查询串、unicode 路径", () => {
    expect(assertPublicHttpUrl("http://cdn.example.com:8080/x.jpg?w=200").ok).toBe(true);
    expect(assertPublicHttpUrl("https://example.com/图/片.png").ok).toBe(true);
  });

  it("字面公网 IP", () => {
    expect(assertPublicHttpUrl("https://8.8.8.8/logo.png").ok).toBe(true);
  });
});

describe("assertPublicHttpUrl —— 协议", () => {
  it("只放行 http/https", () => {
    expect(blocked("file:///etc/passwd")).toContain("只支持 http");
    expect(blocked("ftp://example.com/a.png")).toContain("只支持 http");
    expect(blocked("data:image/png;base64,AAAA")).toContain("只支持 http");
    expect(blocked("javascript:alert(1)")).toContain("只支持 http");
  });

  it("无法解析的串被拒", () => {
    expect(blocked("not a url")).toBeTruthy();
  });
});

describe("assertPublicHttpUrl —— SSRF：字面私有地址", () => {
  it("云元数据地址 —— 这条是这个模块存在的理由", () => {
    expect(blocked("http://169.254.169.254/latest/meta-data/")).toContain("内网地址");
  });

  it("IPv4 私有段与环回", () => {
    for (const host of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "0.0.0.0",
      "100.64.0.1",
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(blocked(`http://${host}/a.png`), host).toContain("内网地址");
    }
  });

  it("172.32 不在私有段内，不该误杀", () => {
    expect(assertPublicHttpUrl("http://172.32.0.1/a.png").ok).toBe(true);
  });

  it("IPv6 环回、唯一本地、链路本地", () => {
    for (const host of ["[::1]", "[::]", "[fd00::1]", "[fc12::3]", "[fe80::1]"]) {
      expect(blocked(`http://${host}/a.png`), host).toContain("内网地址");
    }
  });

  it("IPv4-mapped IPv6 也要拦", () => {
    expect(blocked("http://[::ffff:127.0.0.1]/a.png")).toContain("内网地址");
    expect(blocked("http://[::ffff:169.254.169.254]/a.png")).toContain("内网地址");
  });
});

describe("assertPublicHttpUrl —— SSRF：内网主机名", () => {
  it("裸主机名一律拒 —— 内网里 metadata / redis 这类名字会解析到内部服务", () => {
    expect(blocked("http://metadata/latest/")).toContain("内网主机名");
    expect(blocked("http://redis:6379/")).toContain("内网主机名");
  });

  it("localhost 与内网后缀", () => {
    expect(blocked("http://localhost:3000/a.png")).toContain("本机或内网");
    expect(blocked("http://foo.local/a.png")).toContain("本机或内网");
    expect(blocked("http://db.internal/a.png")).toContain("本机或内网");
    expect(blocked("http://x.localhost/a.png")).toContain("本机或内网");
    expect(blocked("http://x.home.arpa/a.png")).toContain("本机或内网");
  });

  it("名字里带 local 但后缀不匹配的公网域名不该误杀", () => {
    expect(assertPublicHttpUrl("https://localhost.example.com/a.png").ok).toBe(true);
    expect(assertPublicHttpUrl("https://internal.example.com/a.png").ok).toBe(true);
  });
});
