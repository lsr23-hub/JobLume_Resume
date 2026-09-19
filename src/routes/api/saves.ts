import { createFileRoute } from "@tanstack/react-router";
import { writeSaveFile, type SaveKind } from "@/lib/server/saves";

/**
 * 把一份数据镜像到 `<仓库根>/saves/<userId>/`。
 *
 * ⚠️ **这是全项目唯一按请求往磁盘写文件的端点。** 它只写 `saves/` 之下，
 * 路径片段由 `resolveSavePath` 严格校验（见该文件的注释）。本工具按设计跑在
 * 本机（`node server.mjs`），但**若把它部署到公网，请先关掉这个端点** ——
 * 那等于对外开了一个受限于 `saves/` 的文件写入面。
 *
 * 真相源仍是浏览器 localStorage，这里只是镜像：写失败不影响应用继续用，
 * 调用方自行决定要不要提示用户。
 */
const KINDS: readonly SaveKind[] = ["profile", "resume", "jd"];

const isKind = (v: unknown): v is SaveKind =>
  typeof v === "string" && (KINDS as readonly string[]).includes(v);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/saves")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "请求体不是合法 JSON" }, 400);
        }

        if (typeof payload !== "object" || payload === null) {
          return json({ ok: false, error: "请求体不是对象" }, 400);
        }

        const { userId, kind, id, data } = payload as Record<string, unknown>;

        if (!isKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }
        if (data === undefined) {
          return json({ ok: false, error: "缺少 data" }, 400);
        }

        try {
          const full = await writeSaveFile(process.cwd(), userId, kind, id, data);
          // 只回相对路径：绝对路径会暴露用户的目录结构，而界面上要显示的
          // 也只是「存到哪去了」这件事
          const rel = full.slice(process.cwd().length + 1);
          return json({ ok: true, path: rel });
        } catch (error) {
          // 校验失败是**调用方的错**（400），写盘失败是环境问题（500）
          const message = error instanceof Error ? error.message : String(error);
          const isValidation = message.startsWith("[saves]");
          return json({ ok: false, error: message }, isValidation ? 400 : 500);
        }
      },
    },
  },
});
