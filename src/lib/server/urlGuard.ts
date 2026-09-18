/**
 * 出站 URL 准入检查。
 *
 * 起因：`/api/proxy/image` 是**匿名可访问、无鉴权**的转发端点（取一张远程图片）。
 * 不做检查时它在公网部署上就是一个 SSRF 跳板 —— 拿 `?url=http://169.254.169.254/...`
 * 就能读到云主机的实例元数据。这条路径此前没有任何限制。
 *
 * 这里只做**字面量层面**的拦截：协议、裸主机名、字面 IP 落在私有段。
 * 刻意不做 DNS 解析 —— 那需要异步 + Node 专有模块，而且解析完到 fetch
 * 之间仍有 TOCTOU 窗口。所以**残余风险是 DNS rebinding**：攻击者用自己控制的
 * 域名解析到内网地址。要堵死得在连接层做（固定解析结果后直连 IP），
 * 不是这一层能解决的。这里的目标是把随手可打的洞堵上，并在注释里说清边界。
 */

/** IPv4 私有 / 环回 / 链路本地 / 保留段 */
const BLOCKED_V4: RegExp[] = [
  /^0\./, // 本网络
  /^10\./, // 私有
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
  /^127\./, // 环回
  /^169\.254\./, // 链路本地（云元数据就在这）
  /^172\.(1[6-9]|2\d|3[01])\./, // 私有
  /^192\.0\.0\./, // IETF 保留
  /^192\.168\./, // 私有
  /^198\.(1[89])\./, // 基准测试
  /^22[4-9]\.|^2[3-5]\d\./, // 组播与保留
];

/** 不该被当作图片源的主机名后缀 */
const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

const isBlockedIpv4 = (host: string): boolean => BLOCKED_V4.some((re) => re.test(host));

const stripBrackets = (host: string): string =>
  host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

/** 只有 IPv6 字面量的 hostname 里会带冒号 */
const isIpv6Literal = (host: string): boolean => stripBrackets(host).includes(":");

const isIpv4Literal = (host: string): boolean => /^\d+\.\d+\.\d+\.\d+$/.test(host);

const hexPairToIpv4 = (hi: string, lo: string): string => {
  const h = parseInt(hi, 16);
  const l = parseInt(lo, 16);
  return `${(h >> 8) & 255}.${h & 255}.${(l >> 8) & 255}.${l & 255}`;
};

const isBlockedIpv6 = (host: string): boolean => {
  const h = stripBrackets(host).toLowerCase();
  if (h === "::" || h === "::1") return true;

  // IPv4-mapped 有两种写法，URL 解析会把点分那版规范成十六进制
  // （::ffff:127.0.0.1 → ::ffff:7f00:1），两种都要认
  const dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isBlockedIpv4(dotted[1]);
  const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) return isBlockedIpv4(hexPairToIpv4(hex[1], hex[2]));

  // fc00::/7 唯一本地、fe80::/10 链路本地
  return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
};

export type UrlVerdict = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * 这个 URL 能不能拿来当远程图片源。
 *
 * 只放行 http/https，且主机名必须是**带点的域名或公网字面 IP** ——
 * 裸主机名（`metadata`、`redis`）在内网里会解析到内部服务，一律拒掉。
 */
export const assertPublicHttpUrl = (raw: string): UrlVerdict => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL 格式不正确" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `只支持 http 与 https，收到 ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "URL 缺少主机名" };

  // 字面 IP：v6 与 v4 分开判，判完直接放行（不再走域名那几条规则）
  if (isIpv6Literal(host)) {
    if (isBlockedIpv6(host)) return { ok: false, reason: `不允许访问内网地址：${host}` };
    return { ok: true, url };
  }
  if (isIpv4Literal(host)) {
    if (isBlockedIpv4(host)) return { ok: false, reason: `不允许访问内网地址：${host}` };
    return { ok: true, url };
  }

  if (host === "localhost" || BLOCKED_SUFFIXES.some((sfx) => host.endsWith(sfx))) {
    return { ok: false, reason: `不允许访问本机或内网主机名：${host}` };
  }
  // 裸主机名没有点。公网域名不存在这种形式，而内网里
  // `metadata`、`redis` 这类名字会解析到内部服务
  if (!host.includes(".")) {
    return { ok: false, reason: `不允许访问内网主机名：${host}` };
  }

  return { ok: true, url };
};
