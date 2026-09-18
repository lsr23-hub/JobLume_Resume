import { createFileRoute } from "@tanstack/react-router";
import { assertPublicHttpUrl } from "@/lib/server/urlGuard";

/**
 * 远程图片转发。
 *
 * **这个端点是匿名可访问的**（不需要登录、不带 API Key），所以它同时是
 * SSRF 跳板和 XSS 落地页的候选，两处都做过加固：
 *
 * - **SSRF**：只放行 http/https、公网域名或字面公网 IP；私有/环回/链路本地/
 *   CGNAT/IPv6 唯一本地段一律拒。跳转不自动跟随，逐跳重新过检查
 *   （否则一个公网 URL 302 到 `169.254.169.254` 就绕过了）。见 `urlGuard.ts`
 *   里写明的残余风险（DNS rebinding）。
 * - **XSS**：上游返回的 `Content-Type` 不再原样透传。以前 `?url=` 指向一个
 *   返回 HTML 的地址，浏览器就会在**本站源**上渲染攻击者的页面。现在只接受
 *   `image/*`，其余按 415 拒掉。
 * - 另外去掉 `Access-Control-Allow-Origin: *` —— 同源调用不需要它，
 *   留着等于让别人拿我们当免费图床。
 *
 * 体积上限按**实际读到的字节**算，不信 `Content-Length`。
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

const fail = (reason: string, status: number) =>
  Response.json({ error: reason }, { status });

/** 逐跳跟随，每一跳都重新过准入检查 */
const fetchImage = async (start: URL): Promise<Response> => {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: current.origin,
      },
    });

    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) return fail("上游返回跳转但没给 Location", 502);
    if (hop === MAX_REDIRECTS) return fail("跳转次数过多", 502);

    const next = assertPublicHttpUrl(new URL(location, current).toString());
    if (!next.ok) return fail(`跳转目标被拒：${next.reason}`, 400);
    current = next.url;
  }
  return fail("跳转次数过多", 502);
};

/** 边读边计数 —— Content-Length 可以是假的 */
const readCapped = async (
  body: ReadableStream<Uint8Array> | null
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> => {
  if (!body) return { ok: true, bytes: new Uint8Array() };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
};

export const Route = createFileRoute("/api/proxy/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const raw = new URL(request.url).searchParams.get("url");
          if (!raw) return fail("缺少图片URL参数", 400);

          const verdict = assertPublicHttpUrl(raw);
          if (!verdict.ok) return fail(verdict.reason, 400);

          const response = await fetchImage(verdict.url);
          if (!response.ok) {
            return fail(`获取图片失败：上游返回 ${response.status}`, 502);
          }

          const contentType = (response.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase();
          if (!contentType.startsWith("image/")) {
            return fail(
              `上游返回的不是图片（${contentType || "无 Content-Type"}）`,
              415
            );
          }

          const read = await readCapped(response.body);
          if (!read.ok) return fail(`图片超过 ${MAX_BYTES / 1024 / 1024}MB 上限`, 413);
          if (read.bytes.byteLength === 0) return fail("图片内容为空", 400);

          return new Response(read.bytes, {
            headers: {
              // 用校验过的值，不透传上游的原始头
              "Content-Type": contentType,
              "Content-Length": String(read.bytes.byteLength),
              "Cache-Control": "no-store",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          return fail(`处理图片请求时出错：${message}`, 502);
        }
      },
    },
  },
});
