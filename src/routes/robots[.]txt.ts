import { createFileRoute } from "@tanstack/react-router";
import { absoluteUrl } from "@/config/site";

/**
 * robots.txt 由服务端路由提供，而不是放在 `public/` 里。
 *
 * 原因：`server.mjs` 先查静态文件再交给路由处理，`public/` 里的同名文件会把
 * 这条路由**完全遮住** —— 改了路由却没有任何效果。Cloudflare 的
 * `[assets]` 也是同样的优先级。所以这里必须没有同名的静态文件。
 *
 * Sitemap 行只在配了站点地址时才写：指向错误域名的 sitemap 比不写更糟。
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const sitemap = absoluteUrl("/sitemap.xml");
        const lines = ["User-agent: *", "Allow: /"];
        if (sitemap) lines.push("", "# Sitemap", `Sitemap: ${sitemap}`);

        return new Response(lines.join("\n") + "\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
