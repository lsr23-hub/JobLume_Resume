import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import serverEntry from "./dist/server/server.js";

const clientDir = resolve(process.cwd(), "dist/client");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOSTNAME || "0.0.0.0";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8"
};

function getContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  return MIME_TYPES[extension] || "application/octet-stream";
}

function toHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

function resolveStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const normalized = normalize(decoded).replace(/^[/\\]+/, "");
  const absolutePath = resolve(clientDir, normalized);
  if (!absolutePath.startsWith(clientDir)) return null;
  if (!existsSync(absolutePath)) return null;
  const stats = statSync(absolutePath);
  if (!stats.isFile()) return null;
  return absolutePath;
}

function tryServeStatic(req, res, url) {
  if (!url.pathname || url.pathname.endsWith("/")) return false;
  const filePath = resolveStaticFile(url.pathname);
  if (!filePath) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", getContentType(filePath));
  if (url.pathname.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("set-cookie");
  if (!existing) {
    res.setHeader("set-cookie", value);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader("set-cookie", [...existing, value]);
    return;
  }
  res.setHeader("set-cookie", [String(existing), value]);
}

const startedAt = Date.now();

/**
 * 限流的取址模式。
 *
 * 没设 `TRUST_PROXY` 时，`clientIpOf` 一律返回 "unknown" —— 也就是**全站共用一个
 * 额度**。这是刻意的（直连部署下转发头由客户端伪造，信它等于没限流），
 * 但它的失败方式很隐蔽：所有用户互相挤额度，看起来像"服务坏了"。
 * 所以启动时把当前模式打出来，并放进 /healthz —— 出事时第一眼能看到。
 */
const trustProxy = process.env.TRUST_PROXY === "1";
const rateLimitMode = trustProxy ? "per-ip" : "shared";

/**
 * 健康检查。
 *
 * 放在静态文件与路由之前，所以它不经过应用渲染，也不受 /api 的限流影响 ——
 * 探针被限流会把一次限流误报成服务不可用。
 *
 * 能返回 200 就说明：HTTP 服务在收连接，且 dist/server/server.js 已经加载成功
 * （加载失败的话进程起不来）。刻意不做更深的依赖检查：这个应用没有数据库，
 * 上游 LLM 是用户自带 key、按需调用的，把它们算进存活判定会让探针在
 * 用户没配 key 时误报故障。
 */
function handleHealthz(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end();
    return;
  }

  const body = JSON.stringify({
    status: "ok",
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    // "shared" 表示所有请求共用一个限流额度 —— 部署在反向代理后面时
    // 应该设 TRUST_PROXY=1，否则用户会互相挤掉额度
    rateLimitMode
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(body));

  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const hostHeader = req.headers.host || `localhost:${port}`;
    const protocol = (req.headers["x-forwarded-proto"] || "http").toString().split(",")[0].trim();
    const url = new URL(req.url || "/", `${protocol}://${hostHeader}`);

    if (url.pathname === "/healthz") {
      handleHealthz(req, res);
      return;
    }

    if (tryServeStatic(req, res, url)) return;

    const method = (req.method || "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";

    // 把「客户端还在不在」接到 Request 的 signal 上。
    // 不接的话 request.signal 是一个永远不会触发的空信号 —— 路由里
    // 传给上游 fetch 也就等于没传，用户关掉页面之后服务端照样把那次
    // 生成跑完，token 照烧。
    const clientGone = new AbortController();
    res.on("close", () => {
      // writableEnded 为真说明是我们正常写完再关的，那不是断开
      if (!res.writableEnded) clientGone.abort();
    });

    const init = {
      method,
      headers: toHeaders(req.headers),
      signal: clientGone.signal
    };

    if (hasBody) {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }

    const request = new Request(url, init);
    const response = await serverEntry.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        appendSetCookie(res, value);
      } else {
        res.setHeader(key, value);
      }
    });

    if (method === "HEAD" || !response.body) {
      res.end();
      return;
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    console.error("Server error:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
  console.log(
    rateLimitMode === "per-ip"
      ? "Rate limit: per client IP (TRUST_PROXY=1)"
      : "Rate limit: SHARED — all clients share one quota. " +
        "Set TRUST_PROXY=1 if a reverse proxy sits in front."
  );
});
