import { createFileRoute } from "@tanstack/react-router";
import {
  SAVES_DIRNAME,
  isSaveKind,
  listUserIds,
  readSaveTree,
  removeSaveFile,
  savesEnabled,
  savesRoot,
  writeSaveFile,
} from "@/lib/server/saves";
import path from "node:path";

/**
 * 存档目录 `saves/<userId>/` 的读写端点。
 *
 * ⚠️ **这是全项目唯一按请求读写用户数据的端点。** 它既是存储后端也是泄露面 ——
 * 一旦部署到公网，任何能访问站点的人都能读到所有人的姓名、联系方式与经历。
 * 所以它由 `SAVES_ENABLED` 守着，**默认关**（见 `lib/server/saves.ts` 的头注释）。
 * 关了之后这里返回 404，与「这个路由不存在」不可区分。
 *
 * 路径校验全在 `lib/server/saves.ts` 里，这里只做请求形状的检查。
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** 关掉时一律 404 —— 不给出「有这个端点但你没权限」这种信息 */
const disabled = () => json({ ok: false, error: "Not Found" }, 404);

const readBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const payload = await request.json();
    if (typeof payload !== "object" || payload === null) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const Route = createFileRoute("/api/saves")({
  server: {
    handlers: {
      /**
       * 读回存档。
       *
       * - 不带参数：整棵树（启动时用）
       * - `?userId=`：只读那一个用户
       *
       * 回一个 `root` 是刻意的：界面上要能显示「存档目录在哪」。这个路径由服务端的
       * cwd / `SAVES_ROOT` 决定，客户端本来无从知道，而用户最常问的就是这个。
       */
      GET: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const url = new URL(request.url);
        const userId = url.searchParams.get("userId");
        const root = savesRoot();

        try {
          const ids = userId ? [userId] : await listUserIds(root);
          const users: Record<string, unknown> = {};
          for (const id of ids) {
            users[id] = await readSaveTree(root, id);
          }
          return json({
            ok: true,
            root: path.join(root, SAVES_DIRNAME),
            users,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isValidation = message.startsWith("[saves]");
          return json({ ok: false, error: message }, isValidation ? 400 : 500);
        }
      },

      /**
       * 写一份存档。
       *
       * 真相源在磁盘上，所以这里的失败**必须让调用方知道** —— 客户端会把没写成功的
       * 改动留在 journal 里重试，而不是当它已经存好了。
       */
      POST: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const payload = await readBody(request);
        if (!payload) return json({ ok: false, error: "请求体不是合法 JSON 对象" }, 400);

        const { userId, kind, id, data } = payload;
        if (!isSaveKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }
        if (data === undefined) {
          return json({ ok: false, error: "缺少 data" }, 400);
        }

        try {
          const full = await writeSaveFile(savesRoot(), userId, kind, id, data);
          // 只回相对路径：绝对路径对调用方没用，而 `root` 已经在 GET 里给过了
          const rel = path.relative(savesRoot(), full);
          return json({ ok: true, path: rel });
        } catch (error) {
          // 校验失败是**调用方的错**（400），写盘失败是环境问题（500）
          const message = error instanceof Error ? error.message : String(error);
          const isValidation = message.startsWith("[saves]");
          return json({ ok: false, error: message }, isValidation ? 400 : 500);
        }
      },

      /**
       * 删掉一份存档 —— 删简历 / 删岗位时，磁盘上那份文件要跟着消失。
       *
       * 安全校验走的是同一个 `resolveSavePath`，所以能删的范围与能写的范围完全一致。
       * 注意这里**没有**「删整个用户目录」这个操作，理由见 `removeUserDir`。
       */
      DELETE: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const payload = await readBody(request);
        if (!payload) return json({ ok: false, error: "请求体不是合法 JSON 对象" }, 400);

        const { userId, kind, id } = payload;
        if (!isSaveKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }

        try {
          const full = await removeSaveFile(savesRoot(), userId, kind, id);
          return json({ ok: true, path: path.relative(savesRoot(), full) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isValidation = message.startsWith("[saves]");
          return json({ ok: false, error: message }, isValidation ? 400 : 500);
        }
      },
    },
  },
});
