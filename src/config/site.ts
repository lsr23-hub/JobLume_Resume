/**
 * 站点对外地址 —— canonical / og:image / hreflang / robots / sitemap 的唯一来源。
 *
 * 由构建期注入（`vite.config.ts` 的 `define: { __SITE_URL__ }`），不读运行时
 * 环境变量：`head()` 在浏览器里也会求值，那里没有 `process.env`，运行时读取会
 * 直接抛 ReferenceError。构建期替换成字面量后，服务端与客户端拿到同一个值。
 *
 * **未配置时 `SITE_URL` 为空串，此时一律不输出绝对 URL。** 指向错误域名的
 * canonical 比没有 canonical 更糟 —— 那等于把自己的页面归给别人的站。
 */
export const SITE_URL: string = __SITE_URL__;

export const hasSiteUrl: boolean = SITE_URL.length > 0;

/** 站点根地址，去掉结尾斜杠；未配置时为 null */
const origin = (): string | null =>
  hasSiteUrl ? SITE_URL.replace(/\/+$/, "") : null;

/** 拼绝对 URL；未配置站点地址时返回 null，调用方据此省略该标签 */
export const absoluteUrl = (path: string): string | null => {
  const base = origin();
  return base === null ? null : `${base}${path.startsWith("/") ? path : `/${path}`}`;
};
