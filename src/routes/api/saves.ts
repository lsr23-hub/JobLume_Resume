import { createFileRoute } from "@tanstack/react-router";
import {
  MAX_OPS_PER_REQUEST,
  SAVES_DIRNAME,
  applySaveOps,
  isSaveKind,
  isSaveOp,
  listUserIds,
  readSaveTree,
  removeUserDir,
  resolveSavePath,
  savesEnabled,
  savesRoot,
  type SaveOp,
} from "@/lib/server/saves";
import path from "node:path";

/**
 * 存档目录 `saves/<userId>/` 的读写端点。
 *
 * ⚠️ **这是全项目唯一按请求读写用户数据的端点。** 它既是存储后端也是泄露面 ——
 * 一旦部署到公网，任何能访问站点的人都能读到所有人的姓名、联系方式与经历。
 * 所以它由 `SAVES_ENABLED` 守着，**默认关**（见 `lib/server/saves.ts` 的头注释）。
 * 关了之后这里返回 404，与「这个路由不存在」不可区分 —— ⚠️ **这是契约，不是巧合**：
 * 客户端正是靠这个 404 判定「本次部署没有磁盘存档」并进入降级模式
 * （`lib/saves/syncStatus.ts` 的 `disabled`）。改成 403 会让那个判定失效 ——
 * 客户端会把它当成失败，重试到上限后在界面上报错。
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

/**
 * 校验失败是**调用方的错**（400），读写失败是环境问题（500）。
 * 判据是 `lib/server/saves.ts` 里 `[saves]` 前缀的约定 —— 那边的基线错误刻意不带
 * 这个前缀，就是为了落到 500。
 */
const statusOf = (message: string | undefined): number =>
  message?.startsWith("[saves]") ? 400 : 500;

const errorResponse = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return json({ ok: false, error: message }, statusOf(message));
};

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
       * 写盘。支持两种请求形状：
       *
       * **批量（新，推荐）**
       * ```
       * { "userId": "…", "ops": [{ "op": "write", "kind": "resume", "id": "…", "data": {…} },
       *                          { "op": "delete", "kind": "jd", "id": "…" }] }
       * → { ok: true, results: [{ key, ok, hash? , error? }], baseline: {…} }
       * ```
       * 删除也走这里（`op: "delete"`）而不是 HTTP 的 DELETE 方法，因为页面隐藏时的
       * 兜底提交只能用 `navigator.sendBeacon`，而**它发不了 DELETE**。
       *
       * **单条（旧，S3 客户端切换后删除）** —— 请求体与响应形状保持原样，只是内部
       * 改走同一套 `applySaveOps`，免得两处实现漂移。
       *
       * 无论哪种形状，失败**都必须让调用方知道**：客户端据此把没写成功的条目放回
       * 队列重试，并把状态显示在界面上（`lib/saves/syncStatus.ts`）。
       * 没有 journal 重放 —— 刷新页面会丢掉队列，靠首屏那次全量补写兜回来。
       */
      POST: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const payload = await readBody(request);
        if (!payload) return json({ ok: false, error: "请求体不是合法 JSON 对象" }, 400);

        const root = savesRoot();
        const { userId, kind, id, data, ops } = payload;

        // ── 批量形状 ──
        if (Array.isArray(ops)) {
          if (ops.length === 0) return json({ ok: false, error: "ops 不能为空" }, 400);
          if (ops.length > MAX_OPS_PER_REQUEST) {
            return json(
              { ok: false, error: `ops 最多 ${MAX_OPS_PER_REQUEST} 条，收到 ${ops.length}` },
              400
            );
          }
          if (!ops.every(isSaveOp)) {
            // 形状不对的条目直接拒绝整批：放过它只会让某一条静默失败
            return json({ ok: false, error: "ops 里有形状不对的条目" }, 400);
          }
          try {
            const { results, baseline } = await applySaveOps(root, userId, ops);
            return json({ ok: true, results, baseline });
          } catch (error) {
            return errorResponse(error);
          }
        }

        // ── 单条形状（旧）──
        if (!isSaveKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }
        if (data === undefined) {
          return json({ ok: false, error: "缺少 data" }, 400);
        }

        const op: SaveOp = {
          op: "write",
          kind,
          id: typeof id === "string" ? id : undefined,
          data,
        };
        try {
          const { results } = await applySaveOps(root, userId, [op]);
          const result = results[0];
          if (!result?.ok) {
            return json({ ok: false, error: result?.error ?? "写入失败" }, statusOf(result?.error));
          }
          // 只回相对路径：绝对路径对调用方没用，而 `root` 已经在 GET 里给过了
          const rel = path.relative(root, resolveSavePath(root, userId, kind, id));
          return json({ ok: true, path: rel });
        } catch (error) {
          return errorResponse(error);
        }
      },

      /**
       * 删存档。两种范围，**必须显式指定**：
       *
       * - `{ userId, kind, id }` —— 删一份存档（删简历 / 删岗位时跟着删文件）
       * - `{ userId, scope: "user" }` —— 删掉这个用户的**整个目录**（删用户时连带清理）
       *
       * `scope` 刻意要求显式给出：漏传 `kind` 的请求如果默认走递归删除，就会把整个
       * 用户删掉。宁可报 400，也不要一个"少写一个字段"就变成全删的默认值。
       *
       * 两种范围的安全校验是同一套（`resolveSavePath` / `resolveUserDir`），所以能删的
       * 范围仍与能写的范围一致 —— 客户端传的是 userId 这个**路径片段**，从来不是路径。
       */
      DELETE: async ({ request }) => {
        if (!savesEnabled()) return disabled();

        const payload = await readBody(request);
        if (!payload) return json({ ok: false, error: "请求体不是合法 JSON 对象" }, 400);

        const root = savesRoot();
        const { userId, kind, id, scope } = payload;

        if (scope === "user") {
          try {
            const full = await removeUserDir(root, userId);
            return json({ ok: true, path: path.relative(root, full) });
          } catch (error) {
            return errorResponse(error);
          }
        }
        if (scope !== undefined) {
          return json({ ok: false, error: `未知的 scope：${String(scope)}` }, 400);
        }

        if (!isSaveKind(kind)) {
          return json({ ok: false, error: `未知的 kind：${String(kind)}` }, 400);
        }

        const op: SaveOp = { op: "delete", kind, id: typeof id === "string" ? id : undefined };
        try {
          const { results } = await applySaveOps(root, userId, [op]);
          const result = results[0];
          if (!result?.ok) {
            return json({ ok: false, error: result?.error ?? "删除失败" }, statusOf(result?.error));
          }
          return json({ ok: true, path: path.relative(root, resolveSavePath(root, userId, kind, id)) });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
