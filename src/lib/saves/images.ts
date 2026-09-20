/**
 * 图片的命名规则 —— 前后端共用。
 *
 * 单独成文件而不是留在 `lib/server/saves.ts`：那边引了 `node:fs`，客户端沾不得，
 * 而客户端现在**必须**能判断"这个字符串是不是一个图片引用"（渲染前要把引用解析成
 * `blob:` URL）。与 `kinds.ts` / `baseline.ts` 同一个理由。
 */

/** 图片 id 的前缀。新引用一律长这样：`img_<uuid>.<ext>` */
export const IMAGE_ID_PREFIX = "img_";

/**
 * 旧引用的前缀（`idb:img_<uuid>`）。
 *
 * 保留是为了**已存在的数据不用迁移**：那些图片只在 IndexedDB 里，解析路径照旧。
 * 新写入的一律用不带前缀的文件名。
 */
export const IMAGE_REF_PREFIX = "idb:";

/**
 * MIME → 扩展名。
 *
 * **扩展名由服务端从请求的 `Content-Type` 推出来，客户端不传** —— 所以存下来的路径
 * 永远由服务端拼，客户端左右不了它。这份白名单同时就是"允许哪些格式"的定义。
 *
 * 覆盖的是这个应用真能产出的：`compressImage` 走 canvas 重编码，`file.type` 是什么就
 * 编成什么；裁剪器固定输出 jpeg。SVG 不在内 —— 它过一遍 canvas 出来就是 PNG。
 */
export const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** 单张图片上限。存档是给人看/进 git 的镜像，不该被塞进几十兆的原图 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 单个路径片段的字符集。与 `lib/server/saves.ts` 的 `SAFE_SEGMENT` 同一条纪律 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const isSafeSegment = (value: unknown): value is string =>
  typeof value === "string" && SAFE_SEGMENT.test(value);

/**
 * 文件名长这样：`img_<uuid>.<ext>`。
 *
 * ⚠️ **id 与扩展名必须分开校验**：`SAFE_SEGMENT` 刻意不含 `.`（那一条堵死了 `..`），
 * 所以拿整个文件名去过它会把合法文件名一并拒掉。这里按**最后一个点**切开，两半各校验。
 *
 * ⚠️ **强制 `img_` 前缀**：少了这条，任意一个长得像文件名的字符串（`avatar.png`）
 * 都会被当成引用去查 —— 而用户的照片字段里确实可能写着 `/avatar.png` 这样的路径。
 * 加上前缀之后，"是不是引用"这个问题就有了确定的答案。
 */
export const isImageFileName = (name: unknown): name is string => {
  if (typeof name !== "string") return false;
  const at = name.lastIndexOf(".");
  if (at <= 0) return false;

  const id = name.slice(0, at);
  const ext = name.slice(at + 1);
  if (!id.startsWith(IMAGE_ID_PREFIX)) return false;
  return (
    isSafeSegment(id) && Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXT, ext)
  );
};

/** 由 id 与 MIME 拼出文件名。MIME 不在白名单里就抛错（不"尽量兼容"） */
export const imageFileName = (id: unknown, mime: string): string => {
  if (!isSafeSegment(id) || !id.startsWith(IMAGE_ID_PREFIX)) {
    throw new Error(`非法的图片 id：${String(id).slice(0, 40)}`);
  }
  const ext = IMAGE_EXT_BY_MIME[mime.split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error(`不支持的图片格式：${mime.slice(0, 40)}`);
  return `${id}.${ext}`;
};

/** 由文件名取 MIME。名字非法或扩展名不认识时给 `application/octet-stream` */
export const imageMimeOf = (name: string): string =>
  IMAGE_MIME_BY_EXT[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";

/** 生成一个新的图片 id（不含扩展名） */
export const newImageId = (): string => `${IMAGE_ID_PREFIX}${crypto.randomUUID()}`;

/**
 * 这个值是不是一个图片引用。
 *
 * 三种情况：新引用（`img_x.jpg`）、旧引用（`idb:img_x`）、其余一律不是（外链、
 * `data:`、`/avatar.png` 这类静态路径）—— **其余的原样透传**，这正是老数据不需要迁移的原因。
 */
export const isImageRef = (value: unknown): value is string =>
  typeof value === "string" &&
  (value.startsWith(IMAGE_REF_PREFIX) || isImageFileName(value));

/** 内容里引用了哪些图片（去重）。孤儿回收靠它扫 */
export const collectImageRefs = (values: Array<string | undefined>): string[] => {
  const out = new Set<string>();
  for (const value of values) if (isImageRef(value)) out.add(value);
  return Array.from(out);
};

export { isRecord as isImageRecord };
