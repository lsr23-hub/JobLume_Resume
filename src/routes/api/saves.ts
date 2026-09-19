import { createFileRoute } from "@tanstack/react-router";
import { isSaveKind, removeSaveFile, writeSaveFile } from "@/lib/server/saves";
import type { SaveKind } from "@/lib/saves/kinds";

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

        if (!isSaveKind(kind)) {
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

      /**
       * 删掉一份存档 —— 删简历 / 删岗位时，磁盘上的镜像文件要跟着消失。
       *
       * 安全校验走的是同一个 `resolveSavePath`，所以能删的范围与能写的范围
       * 完全一致；**没有「删整个用户目录」这个操作**，理由见 `removeSaveFile`。
       */
      DELETE: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ ok: false, error: "请求体不是合法 JSON" }, 400);
        }
        if (typeof payload !== "object" || payload === null) {
          return json({ ok: false, error: "请求体不是对象" }, 400);
        }

        const { userId, kind, id } = payload as Record<string, unknown>;
        if (!isSaveKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }

        try {
          const full = await removeSaveFile(process.cwd(), userId, kind, id);
          const rel = full.slice(process.cwd().length + 1);
          return json({ ok: true, path: rel });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isValidation = message.startsWith("[saves]");
          return json({ ok: false, error: message }, isValidation ? 400 : 500);
        }
      },
    },
  },
});
