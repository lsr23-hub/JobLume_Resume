import { createFileRoute } from "@tanstack/react-router";
import {
  IMAGE_MIME_BY_EXT,
  imageFileName,
  readImageFile,
  removeImageFile,
  savesEnabled,
  savesRoot,
  writeImageFile,
} from "@/lib/server/saves";

/**
 * 图片端点：`saves/<userId>/images/<imageId>.<ext>`。
 *
 * 图片为什么要单独一条路而不是塞进 `profile.json`：base64 内联会撑爆 localStorage
 * 约 5MB 的配额（2-3 张证书就够），所以二进制**从数据里搬出去**，数据里只留一个
 * 文件名引用。这也让备份、换机器、清缓存三件事同时成立。
 *
 * 与 `/api/saves` 同一套开关（`SAVES_ENABLED`）与同一套路径校验纪律。
 * 扩展名由服务端从请求的 `Content-Type` 推出来，**客户端不传**。
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** 关掉时一律 404 —— 与内容端点同一个契约（客户端靠它判定"本次部署没有磁盘存档"） */
const disabled = () => json({ ok: false, error: "Not Found" }, 404);

const statusOf = (message: string | undefined): number =>
  message?.startsWith("[saves]") ? 400 : 500;

const errorResponse = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: message }, statusOf(message));
};

/** 取扩展名对应的 MIME。只用于响应头，校验已由 `resolveImagePath` 做过 */
const mimeOf = (name: string): string =>
  IMAGE_MIME_BY_EXT[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";

export const Route = createFileRoute("/api/saves/images")({
  server: {
    handlers: {
      /** 取一张图片的原始字节 */
      GET: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");
        const name = url.searchParams.get("name");

        try {
          const bytes = await readImageFile(savesRoot(), userId, name);
          if (!bytes) return json({ ok: false, error: "没有这张图片" }, 404);
          return new Response(bytes, {
            status: 200,
            headers: {
              "content-type": mimeOf(String(name)),
              // 文件名里带 uuid，内容永不改变 —— 可以放心长缓存
              "cache-control": "private, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          return errorResponse(error);
        }
      },

      /**
       * 上传一张图片。请求体是**原始字节**（不是 base64、不是 multipart），
       * `Content-Type` 就是它的真实 MIME，`?id=` 是客户端生成的 `img_<uuid>`。
       *
       * 客户端传 id 而不是让服务端生成：它要**先把引用写进数据**、界面才能立刻显示，
       * 上传是随后的事。传 id 之后扩展名仍由服务端按 MIME 决定，客户端左右不了路径。
       */
      POST: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");
        const id = url.searchParams.get("id");

        try {
          const name = imageFileName(id, request.headers.get("content-type") ?? "");
          const bytes = new Uint8Array(await request.arrayBuffer());
          await writeImageFile(savesRoot(), userId, name, bytes);
          return json({ ok: true, name });
        } catch (error) {
          return errorResponse(error);
        }
      },

      /** 删一张图片（孤儿回收用）。幂等：不存在也算成功 */
      DELETE: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        let payload: Record<string, unknown> | null = null;
        try {
          const parsed = await request.json();
          if (typeof parsed === "object" && parsed !== null) {
            payload = parsed as Record<string, unknown>;
          }
        } catch {
          payload = null;
        }
        if (!payload) return json({ ok: false, error: "请求体不是合法 JSON 对象" }, 400);

        try {
          const full = await removeImageFile(savesRoot(), payload.userId, payload.name);
          return json({ ok: true, name: String(payload.name) });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
