import { createFileRoute } from "@tanstack/react-router";
import { hasSiteUrl, absoluteUrl } from "@/config/site";
import { locales, defaultLocale } from "@/i18n/config";

/**
 * sitemap.xml 由服务端路由提供，理由同 `robots[.]txt.ts`（静态文件会遮住路由）。
 *
 * sitemap 必须是绝对 URL，所以它**强依赖站点地址**：未配置时直接 404 ——
 * 返回一份指向错误域名的 sitemap 会让搜索引擎收录到别人的站。
 * 配置方式见 `src/config/site.ts`。
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        if (!hasSiteUrl) {
          return new Response("Not Found\n", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        const alternates = (self: string) =>
          [
            ...locales
              .filter((l) => l !== self)
              .map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${absoluteUrl(`/${l}`)}" />`),
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(`/${defaultLocale}`)}" />`,
          ].join("\n");

        const entries = locales
          .map(
            (locale) => `  <url>
    <loc>${absoluteUrl(`/${locale}`)}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
${alternates(locale)}
  </url>`
          )
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries}
</urlset>
`;

        return new Response(xml, {
          headers: { "content-type": "application/xml; charset=utf-8" },
        });
      },
    },
  },
});
