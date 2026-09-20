import fs from "node:fs/promises";
import path from "node:path";
// 值导入 + 下面那行 re-export：`export { x } from "…"` 不引入本地绑定，
// 所以这里要单独 import 一次才能在 `isSaveOp` 里用
import { randomUUID } from "node:crypto";
import { isSaveKind, type SaveKind } from "@/lib/saves/kinds";
// 同 kinds：值导入 + 上面的 re-export 各来一次（re-export 不引入本地绑定）
import {
  IMAGE_MIME_BY_EXT,
  MAX_IMAGE_BYTES,
  isImageFileName,
  isImageRef,
} from "@/lib/saves/images";
import { contentHash } from "@/lib/saves/hash";
// 同 kinds：值导入 + 下面的 re-export 各来一次 —— `export { x } from` 不引入本地绑定
import {
  SAVES_SCHEMA_VERSION,
  emptyBaseline,
  recordKey,
  type Baseline,
} from "@/lib/saves/baseline";

export { isSaveKind, SAVE_KINDS, type SaveKind } from "@/lib/saves/kinds";

/**
 * 存档目录：`<仓库根>/saves/<userId>/`（可用 `SAVES_ROOT` 改根）。
 *
 * ⚠️ **这是全项目唯一按请求读写用户数据的模块。** 三层防护缺一不可：
 * 1. 路径片段只允许 uuid 那一类安全字符（见 `SAFE_SEGMENT`）——不含 `.`、`/`、`\`
 * 2. 拼完之后再用 `path.relative` 确认没跑出 `saves/`（纵深防御，防字符集被绕过）
 * 3. 读写只发生在 `saves/` 下，而静态文件服务的是 `dist/client`，两者不相交
 *
 * 目录形状（`.bak` 是上一版，见 `writeSaveFile`）：
 * ```
 * saves/<userId>/.baseline.json      ← 同步基线，见下面的「基线」一节
 * saves/<userId>/profile.json
 * saves/<userId>/resumes/<resumeId>.json
 * saves/<userId>/jds/<targetId>.json
 * ```
 *
 * **`SAVES_ENABLED` 是硬开关，默认关。** 这个端点既是存储后端也是泄露面 ——
 * 一旦部署到公网，任何能访问站点的人都能读到所有人的姓名、联系方式与经历。
 * 默认关的意思是「没想过这件事的部署会失败关闭」，而不是「又一个可以忘的配置项」。
 * 本机开发（`pnpm dev`）与 docker-compose 都显式设了它。
 */
export const SAVES_ROOT_ENV = "SAVES_ROOT";
export const SAVES_ENABLED_ENV = "SAVES_ENABLED";

/** 端点开关。只认 `"1"` —— 空串、`"0"`、`"true"` 都算关，不留模糊地带 */
export const savesEnabled = (): boolean => process.env[SAVES_ENABLED_ENV] === "1";

/**
 * 存档的**父目录**（存档本身落在 `<root>/saves/`）。默认 `process.cwd()`，
 * 容器里用 `SAVES_ROOT` 指到挂载卷上。
 *
 * 名字沿用下面各函数的 `root` 参数语义，不是「saves 目录本身」—— 这一点容易记反，
 * 所以这里与 README 都写清楚。
 */
export const savesRoot = (): string => process.env[SAVES_ROOT_ENV] ?? process.cwd();
export const SAVES_DIRNAME = "saves";

/**
 * 允许作为单个路径片段的字符。
 *
 * 刻意**不含 `.`** —— 这一条就堵死了 `..`；也不含 `/` 与 `\`，堵死跨目录。
 * userId 是 uuid、resumeId / targetId 也是 uuid，都落在这个字符集里。
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const isSafeSegment = (value: unknown): value is string =>
  typeof value === "string" && SAFE_SEGMENT.test(value);

const SUBDIR: Record<SaveKind, string> = {
  profile: "",
  resume: "resumes",
  jd: "jds",
};

/**
 * 把 (userId, kind, id) 解析成一个绝对路径。任何不安全的输入都抛错，绝不「尽量兼容」。
 *
 * `id` 只对 resume / jd 有意义（各自一个文件）；profile 每个用户只有一份。
 */
export const resolveSavePath = (
  root: string,
  userId: unknown,
  kind: SaveKind,
  id?: unknown
): string => {
  const userDir = resolveUserDir(root, userId);

  if (kind === "profile") {
    if (id !== undefined && id !== null) {
      throw new Error("[saves] profile 不接受 id");
    }
    return path.join(userDir, "profile.json");
  }

  if (!isSafeSegment(id)) {
    throw new Error(`[saves] 非法的 id：${String(id).slice(0, 40)}`);
  }
  return path.join(userDir, SUBDIR[kind], `${id}.json`);
};

/**
 * 解析某个用户的目录 `saves/<userId>/`。
 *
 * 拆出来是因为读取侧要**列目录**，而列目录没有 id 可以交给 `resolveSavePath`。
 * 校验与 `resolveSavePath` 完全同一套，不另开一条路。
 */
export const resolveUserDir = (root: string, userId: unknown): string => {
  if (!isSafeSegment(userId)) {
    throw new Error(`[saves] 非法的 userId：${String(userId).slice(0, 40)}`);
  }

  const rootDir = path.resolve(root, SAVES_DIRNAME);
  const full = path.resolve(rootDir, userId);

  // 纵深防御：上面的字符集已经堵死了 `..` 与分隔符，这里再确认一次最终路径
  // 确实落在 saves/ 之内。安全校验不该只有一层。
  const rel = path.relative(rootDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("[saves] 解析出的路径跑出了 saves/ 目录");
  }
  return full;
};

/** 单次写入的体积上限。存档是给人看/进 git 的镜像，不该被塞进几十兆的图片 */
export const MAX_SAVE_BYTES = 4 * 1024 * 1024;

/**
 * 先写临时文件再 `rename`。
 *
 * **同目录 rename 是原子的**：读者要么看到旧的完整文件，要么看到新的完整文件，
 * 不会看到写了一半的。直接 `writeFile` 做不到 —— 崩溃、断电、或**两个请求同时写
 * 同一个路径**都会留下半截内容（最后那种实测踩到过，见下面的 `withUserLock`）。
 *
 * 临时名**必须每次唯一**：用固定名的话，两个写入者（哪怕不同文件、不同进程）会争
 * 同一个临时路径 —— 先完成的那次把文件 rename 走，另一处紧接着就 ENOENT。
 * 这个坑是在去掉串行化做反向验证时暴露出来的：串行化只是**掩盖**了它，而不是修好了它。
 *
 * 崩溃留下的 `.tmp` 是孤儿，但无害：`listSaveIds` 只认 `<合法片段>.json`，看不见它，
 * 而它最多占一次写入的体积（上限见 `MAX_SAVE_BYTES`）。
 */
const writeFileAtomic = async (full: string, body: string): Promise<void> => {
  const tmp = `${full}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, full);
};

/**
 * 每个用户一条串行链。**这是正确性要求，不是优化。**
 *
 * 起因（实测踩到）：客户端一次 flush 会为**同一个用户**并发发出多个请求 ——
 * 旧的单条形状是「每个文件一个请求」，首屏全量同步时 N 个请求同时到。
 * 而写入路径是「读基线 → 改 → 写回」的读-改-写，于是：
 *   1. **丢更新**：N 个请求都读到同一份旧基线，各自写回，只有最后一个的改动留下
 *   2. **文件损坏**：两次 `writeFile` 交错 —— A 截断后写了 91 字节，而 B 先前写的
 *      更长内容在 91 字节之后残留。真实用户目录里出现过这种文件：合法 JSON 后面
 *      跟着一段 32 位哈希碎片，`readBaseline` 从此每次都抛错，那个用户的写盘全挂
 *
 * 单进程部署下这一层就够了（本项目就是）。多副本部署要另加文件锁 —— 不是本项目的形态。
 */
const userLocks = new Map<string, Promise<void>>();

const withUserLock = async <T>(userId: string, task: () => Promise<T>): Promise<T> => {
  // 无论前一个成功还是失败，都要接着往下走 —— 否则一次失败会把后面全堵死
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  userLocks.set(userId, tail);
  try {
    return await run;
  } finally {
    // 队尾还是自己 → 没人排队了，清掉，别为每个用户常驻一个 Promise
    if (userLocks.get(userId) === tail) userLocks.delete(userId);
  }
};

/**
 * 写一份存档。返回写入的绝对路径（供调用方回显/日志）。
 *
 * 只接受能 JSON 序列化的对象 —— 图片那类二进制以 `idb:` 引用形式留在 JSON 里，
 * 不进这个目录（镜像的是**数据**，不是素材）。
 */
export const writeSaveFile = async (
  root: string,
  userId: unknown,
  kind: SaveKind,
  id: unknown,
  data: unknown
): Promise<string> => {
  const full = resolveSavePath(root, userId, kind, id);
  const body = JSON.stringify(data, null, 2);

  if (Buffer.byteLength(body, "utf8") > MAX_SAVE_BYTES) {
    throw new Error(`[saves] 内容超过 ${MAX_SAVE_BYTES} 字节上限`);
  }

  await fs.mkdir(path.dirname(full), { recursive: true });

  // 内容与磁盘上一字不差就**不写**。两件事同时被这一条解决：
  //
  // 1. 省一次 IO。客户端首屏会把该用户的全部文件重算一遍 diff（基线从空开始），
  //    照写不误的话，每次打开页面都把所有文件重写一次。
  // 2. **保住 `.bak` 的意义。** 它是「上一次写坏了」的后悔药，而覆盖前会 copyFile ——
  //    若每次开机都照写，`.bak` 就被替换成同一份内容，那它再也救不了任何东西。
  //
  // 读失败（权限、目录、半截文件）一律当作「内容不同」，照常往下写 ——
  // 不引入新的失败方式，该报的错由后面那次写入如实报出来。
  let existing: string | null = null;
  try {
    existing = await fs.readFile(full, "utf8");
  } catch {
    existing = null;
  }
  if (existing === body) return full;

  // 覆盖之前把上一版留一份。存档是**唯一副本**，所以「写进去的内容是坏的」这件事
  // 没有第二处能兜底 —— 一次写出空档案就真没了。多一个 4KB 的文件换一次后悔药。
  //
  // 只留一代（每次覆盖 `.bak`）：够救「上一次写坏了」，也让目录不至于越长越胖。
  // 首次写入（原文件不存在）不产生 `.bak`。
  try {
    await fs.copyFile(full, `${full}.bak`);
  } catch (error) {
    // 没有原文件是正常的；别的错（权限、磁盘满）不吞 —— 备份都做不了的话，
    // 紧接着的写入大概率也保不住，宁可让调用方看见
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await writeFileAtomic(full, body);
  return full;
};

/**
 * 删掉一份存档。
 *
 * 为什么需要它：`saves/` 是**镜像**，删了简历/岗位却留着旧文件，磁盘上就会
 * 攒下一堆对不上的东西，`git status` 里也永远显示为未清理。文件不存在不算错
 * （镜像本来就可能落后），幂等。
 *
 * 刻意**只做单文件**，没有「删掉某个用户的整个目录」这个操作 —— 递归删除的
 * 破坏面比写文件大得多，而路径校验再严也不该被用来做 `rm -rf`。删用户时
 * 磁盘上的目录会留下，见 README 的说明。
 */
export const removeSaveFile = async (
  root: string,
  userId: unknown,
  kind: SaveKind,
  id: unknown
): Promise<string> => {
  const full = resolveSavePath(root, userId, kind, id);
  // 连 `.bak` 一起清掉：**删除是用户的显式动作**，留一份「删了还在」的副本
  // 正是「删除没删掉」那类抱怨的来源。`.bak` 保护的是写坏，不是反悔。
  await Promise.all([
    fs.rm(full, { force: true }),
    fs.rm(`${full}.bak`, { force: true }),
  ]);
  return full;
};

// ─────────────────────────────── 基线 ───────────────────────────────

/**
 * 基线的定义（版本号、形状、键规则）在 `lib/saves/baseline.ts` —— 客户端也要读它，
 * 而那个模块不含 node 依赖。这里只做 re-export，不另立一套。
 */
export {
  SAVES_SCHEMA_VERSION,
  emptyBaseline,
  recordKey,
  type Baseline,
} from "@/lib/saves/baseline";

/** 基线文件名。**点开头**，所以不会被 `listSaveIds` 当成一份存档（它只认 `<合法片段>.json`） */
export const BASELINE_FILENAME = ".baseline.json";

export const baselinePath = (root: string, userId: unknown): string =>
  path.join(resolveUserDir(root, userId), BASELINE_FILENAME);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 读基线。
 *
 * - 文件不存在 → **空基线**（还没写过盘，或是从没有基线的版本升上来的目录）
 * - 形状不对 / 版本比本程序新 → **抛错**
 *
 * ⚠️ 这里的错误消息**刻意不带 `[saves]` 前缀**。路由按那个前缀区分「调用方的错（400）」
 * 与「环境的错（500）」，而基线坏了是服务端自己的状态问题 —— 带上前缀会让它被
 * 报成 400，把排查方向指错。
 */
export const readBaseline = async (root: string, userId: unknown): Promise<Baseline> => {
  const full = baselinePath(root, userId);

  let text: string;
  try {
    text = await fs.readFile(full, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyBaseline();
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `基线文件不是合法 JSON：${BASELINE_FILENAME}（删掉它，程序会按内容文件重建）`
    );
  }
  if (!isRecord(parsed)) {
    throw new Error(`基线文件形状不对：${BASELINE_FILENAME}（删掉它，程序会按内容文件重建）`);
  }
  if (typeof parsed.schemaVersion !== "number") {
    throw new Error(`基线文件缺少 schemaVersion：${BASELINE_FILENAME}`);
  }
  if (parsed.schemaVersion > SAVES_SCHEMA_VERSION) {
    throw new Error(
      `存档版本 ${parsed.schemaVersion} 高于本程序支持的 ${SAVES_SCHEMA_VERSION}，拒绝读写这个目录`
    );
  }

  const records: Record<string, string> = {};
  if (isRecord(parsed.records)) {
    for (const [key, value] of Object.entries(parsed.records)) {
      if (typeof value === "string") records[key] = value;
    }
  }
  return { schemaVersion: SAVES_SCHEMA_VERSION, records };
};

/**
 * 写基线。**不备份**（没有 `.bak`）：它是**派生数据** —— 每个哈希都能从对应的内容
 * 文件重新算出来。所以它坏了的补救办法是重算，而不是回滚到上一版。
 */
export const writeBaseline = async (
  root: string,
  userId: unknown,
  baseline: Baseline
): Promise<string> => {
  const full = baselinePath(root, userId);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await writeFileAtomic(full, JSON.stringify(baseline, null, 2));
  return full;
};

// ─────────────────────────────── 读取 ───────────────────────────────

/** 能有一整个目录的那些 kind。profile 一个用户只有一份，不在此列 */
export type CollectionKind = Exclude<SaveKind, "profile">;

/**
 * 读一份存档。**文件不存在返回 null**（镜像/存档本来就可能落后，不是错），
 * 但内容不是合法 JSON 时**抛错** —— 那说明这个文件被人改坏了或写了一半，
 * 调用方要把它记进 `problems` 并**跳过**，绝不能当成「没有这份数据」而在后续
 * 写回时覆盖掉它。
 */
export const readSaveFile = async (
  root: string,
  userId: unknown,
  kind: SaveKind,
  id?: unknown
): Promise<unknown | null> => {
  const full = resolveSavePath(root, userId, kind, id);
  let text: string;
  try {
    text = await fs.readFile(full, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(text);
};

/**
 * 列出一个用户某个集合下的全部 id。
 *
 * 只认 `<合法片段>.json` —— 别的文件（编辑器留下的 `.DS_Store`、`.bak`、
 * 手写的笔记）一律跳过，不报错也不当成数据。
 */
export const listSaveIds = async (
  root: string,
  userId: unknown,
  kind: CollectionKind
): Promise<string[]> => {
  const dir = path.join(resolveUserDir(root, userId), SUBDIR[kind]);

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const ids: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    if (isSafeSegment(id)) ids.push(id);
  }
  // 排序是为了确定性：同一份目录必须产生完全相同的响应，便于比对与测试
  return ids.sort();
};

/** 一个用户的原始存档树。字段值是**未校验的** JSON —— schema 归客户端管 */
export interface RawSaveTree {
  profile: unknown;
  resumes: Record<string, unknown>;
  targets: Record<string, unknown>;
  /**
   * 同步基线（每条记录上次写盘时的内容哈希）。
   *
   * 客户端靠它算「哪些改动还没落盘」，所以它必须跟数据一起回来 —— 让客户端自己存一份
   * 基线就会出现"哪份才算数"的问题，而那正是这套设计要避免的。
   *
   * 读不出来时给**空基线**并记进 `problems`：空基线意味着"什么都不知道已同步"，
   * 也就是所有记录都会被当成待写 —— 多存一次，不丢数据。
   */
  baseline: Baseline;
  /** 读不出来的条目（不是合法 JSON / 读失败）。客户端据此提示，绝不静默覆盖 */
  problems: string[];
}

export const readSaveTree = async (root: string, userId: unknown): Promise<RawSaveTree> => {
  const problems: string[] = [];

  const readOne = async (kind: SaveKind, id?: string): Promise<unknown | null> => {
    try {
      return await readSaveFile(root, userId, kind, id);
    } catch {
      problems.push(id ? `${kind}:${id}` : kind);
      return null;
    }
  };

  const readCollection = async (kind: CollectionKind): Promise<Record<string, unknown>> => {
    const out: Record<string, unknown> = {};
    for (const id of await listSaveIds(root, userId, kind)) {
      const value = await readOne(kind, id);
      if (value !== null) out[id] = value;
    }
    return out;
  };

  // 基线自己也有读不出来的可能（被手改、写了一半、版本比本程序新）。这里不往上抛：
  // 一次读取失败不该让整个存档树读不出来 —— 记进 problems，给空基线。
  let baseline = emptyBaseline();
  try {
    baseline = await readBaseline(root, userId);
  } catch (error) {
    problems.push("baseline");
    baseline = emptyBaseline();
    void error;
  }

  return {
    profile: await readOne("profile"),
    resumes: await readCollection("resume"),
    targets: await readCollection("jd"),
    baseline,
    problems,
  };
};

/** 存档目录下有哪些用户。只认合法目录名，其余（`.DS_Store` 之类）忽略 */
export const listUserIds = async (root: string): Promise<string[]> => {
  const dir = path.resolve(root, SAVES_DIRNAME);

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") continue;
    if (entry.isDirectory() && isSafeSegment(entry.name)) ids.push(entry.name);
  }
  return ids.sort();
};

// ─────────────────────────────── 图片 ───────────────────────────────

/**
 * 图片的命名规则（前缀、扩展名白名单、`isImageFileName` / `imageFileName`）在
 * `lib/saves/images.ts` —— 客户端也要用同一套（渲染前要判断"这是不是一个引用"），
 * 而那个模块不含 node 依赖。这里只做 re-export，不另立一套。
 */
export {
  IMAGE_EXT_BY_MIME,
  IMAGE_ID_PREFIX,
  IMAGE_MIME_BY_EXT,
  IMAGE_REF_PREFIX,
  MAX_IMAGE_BYTES,
  imageFileName,
  isImageFileName,
  isImageRef,
  newImageId,
} from "@/lib/saves/images";

/** 图片子目录。与 `resumes` / `jds` 并列 */
export const IMAGE_DIRNAME = "images";

const resolveImageDir = (root: string, userId: unknown): string =>
  path.join(resolveUserDir(root, userId), IMAGE_DIRNAME);

/** 图片的绝对路径。校验与内容文件同一套纪律，只是多了一步"id 与扩展名分开" */
export const resolveImagePath = (root: string, userId: unknown, name: unknown): string => {
  if (!isImageFileName(name)) {
    throw new Error(`[saves] 非法的图片名：${String(name).slice(0, 40)}`);
  }
  const dir = resolveImageDir(root, userId);
  const full = path.resolve(dir, name);

  // 纵深防御：上面的字符集已经堵死了 `..` 与分隔符，这里再确认最终路径落在 images/ 之内
  const rel = path.relative(dir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("[saves] 图片路径跑出了 images/ 目录");
  }
  return full;
};

/** 写一张图片。复用内容文件那套原子写 —— 半张图比半份 JSON 更难发现 */
export const writeImageFile = async (
  root: string,
  userId: unknown,
  name: unknown,
  bytes: Uint8Array
): Promise<string> => {
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`[saves] 图片超过 ${MAX_IMAGE_BYTES} 字节上限`);
  }
  const full = resolveImagePath(root, userId, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // 这里不能用 `writeFileAtomic`（它收字符串）：图片是原始字节
  const tmp = `${full}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, full);
  return full;
};

/** 读一张图片。不存在给 `null`；内容读不出来交给调用方当 500 */
export const readImageFile = async (
  root: string,
  userId: unknown,
  name: unknown
): Promise<Uint8Array | null> => {
  const full = resolveImagePath(root, userId, name);
  try {
    return await fs.readFile(full);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

/** 删一张图片。幂等：不存在不算错 */
export const removeImageFile = async (
  root: string,
  userId: unknown,
  name: unknown
): Promise<string> => {
  const full = resolveImagePath(root, userId, name);
  await fs.rm(full, { force: true });
  return full;
};

/** 列出这个用户存了哪些图片。只认合法文件名，`.DS_Store` 之类忽略 */
export const listImageNames = async (root: string, userId: unknown): Promise<string[]> => {
  const dir = resolveImageDir(root, userId);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names.filter(isImageFileName).sort();
};

/**
 * 孤儿图片的宽限期。
 *
 * **为什么必需**：图片是"选中即上传"的 —— 字节先落盘，引用要等用户保存数据才写进
 * `*.json`。这中间那段时间里，这张图在磁盘的数据看来就是**孤儿**，而它其实是用户
 * 刚选的。所以刚写进来的文件一律不动。
 *
 * 一小时足够覆盖"选了照片但还没保存"的窗口（关页面时 `pagehide` 会把数据刷下去，
 * 所以那个窗口通常只有几秒），又足以让换过照片的旧文件在下一次保存时被清掉。
 */
export const ORPHAN_IMAGE_GRACE_MS = 60 * 60 * 1000;

/** 存档里被引用的所有图片名。`images/` 之外的字段没有图片，见下面的注释 */
export const collectReferencedImages = async (
  root: string,
  userId: unknown
): Promise<Set<string>> => {
  const refs = new Set<string>();
  const add = (value: unknown) => {
    if (isImageRef(value)) refs.add(value);
  };

  // 图片只可能出现在三处：档案照片、简历照片、证书 url。
  // 富文本里插不了图（tiptap 的依赖里没有 extension-image），所以正文不用扫。
  //
  // ⚠️ **读不出来就抛，不要吞成"没有引用"**：一份坏掉的 `resume.json` 会让它引用的
  // 图片全部变成"孤儿"被删掉。宁可这次不回收 —— 路由那边是 best effort，
  // 下次保存还会再来一次。
  const profile = (await readSaveFile(root, userId, "profile")) as
    | { basic?: { photo?: unknown } }
    | null;
  add(profile?.basic?.photo);

  for (const id of await listSaveIds(root, userId, "resume")) {
    const resume = (await readSaveFile(root, userId, "resume", id)) as
      | { basic?: { photo?: unknown }; certificates?: Array<{ url?: unknown }> }
      | null;
    if (!resume) continue;
    add(resume.basic?.photo);
    for (const certificate of resume.certificates ?? []) add(certificate?.url);
  }

  return refs;
};

/**
 * 删掉 `images/` 里**没被任何数据引用**的文件。
 *
 * 时机是**保存成功之后**（由路由调用），不做定时任务 —— 只在明确的时刻跑，行为可预测。
 * 不回收的话，换过照片、删过证书的旧文件会永远留在盘上越攒越多。
 *
 * 两条防线，缺一不可：
 * 1. **只删没被引用的** —— 扫描的是磁盘上那份数据（刚写下去的那份）
 * 2. **刚写进来的不动**（`ORPHAN_IMAGE_GRACE_MS`）—— 见那个常量的注释
 *
 * 返回删掉的文件名，便于日志与测试。
 */
export const pruneOrphanImages = async (
  root: string,
  userId: unknown,
  graceMs: number = ORPHAN_IMAGE_GRACE_MS
): Promise<string[]> => {
  const referenced = await collectReferencedImages(root, userId);
  const names = await listImageNames(root, userId);
  const removed: string[] = [];
  const now = Date.now();

  for (const name of names) {
    if (referenced.has(name)) continue;

    const full = path.join(resolveImageDir(root, userId), name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    // 太新的不动。**显式比较时间点而不是算差值**：文件的 mtime 可能比 `now` 晚
    // 一毫秒（时间戳粒度），差值成了负数，`< graceMs` 反而把刚写的保护起来 ——
    // 传 `graceMs = 0` 时尤其明显（单测抓到的）
    if (graceMs > 0 && stat.mtimeMs >= now - graceMs) continue;

    await removeImageFile(root, userId, name);
    removed.push(name);
  }

  return removed;
};

export interface DiskUserSummary {
  id: string;
  /** 档案里的姓名。读不出来给 `null`，**不跳过这个用户**（见下） */
  name: string | null;
}

/**
 * 存档目录下有哪些用户、各自叫什么。给「选择用户」弹窗用。
 *
 * 为什么需要它：清掉浏览器数据之后 `currentUserId` 也没了，而 store 刻意不保留
 * 「指向一个不存在的用户」的 id —— 于是盘上的数据**在界面上够不着**。
 * 这个列表就是那条回去的路。
 *
 * 名字读不出来（文件坏了、还没写过档案）时给 `null` 而**不是跳过这个用户**：
 * 目录在那里就说明有数据，"因为名字读不出来就当它不存在"会让用户彻底看不到它。
 */
export const listDiskUsers = async (root: string): Promise<DiskUserSummary[]> => {
  const ids = await listUserIds(root);
  const out: DiskUserSummary[] = [];

  for (const id of ids) {
    let name: string | null = null;
    try {
      const profile = (await readSaveFile(root, id, "profile")) as
        | { basic?: { name?: unknown } }
        | null;
      const raw = profile?.basic?.name;
      if (typeof raw === "string" && raw.trim()) name = raw.trim();
    } catch {
      // 档案坏了也照样把这个人报出去 —— 他能被选中才有机会被修
      name = null;
    }
    out.push({ id, name });
  }
  return out;
};

/**
 * 删掉一个用户的整个存档目录。
 *
 * **这是全项目唯一一处递归删除**，所以单独写一段理由：在应用里删掉一个用户却不删
 * 目录，那个目录会一直留着；而启动对账（S4，见 `plan/saves-design.md` §4）一旦上线，
 * 用户会从磁盘上**复活**（连同简历与岗位）。单文件删除做不到这件事。
 *
 * 边界：只接受一个路径片段，仍走 `isSafeSegment` + `path.relative` 复核。
 * **客户端可以传 userId，但永远不能传路径** —— 与写盘路径是同一个信任级别
 * （`writeSaveFile` 也接客户端给的 userId）。区别在于这里一次删掉整棵子树，
 * 所以它是唯一接受"递归删除"这个动作的地方，校验不允许有一丝松动。
 */
export const removeUserDir = async (root: string, userId: unknown): Promise<string> => {
  const full = resolveUserDir(root, userId);
  await fs.rm(full, { recursive: true, force: true });
  return full;
};

// ─────────────────────── 批量写入（编排） ───────────────────────

export interface WriteOp {
  op: "write";
  kind: SaveKind;
  id?: string;
  data: unknown;
}

export interface DeleteOp {
  op: "delete";
  kind: SaveKind;
  id?: string;
}

export type SaveOp = WriteOp | DeleteOp;

export interface OpResult {
  key: string;
  ok: boolean;
  /** 写入成功时的内容哈希（客户端拿它当新基线）。删除成功没有这个字段 */
  hash?: string;
  /** 失败原因原文，可直接用于排查 */
  error?: string;
}

export interface ApplyResult {
  results: OpResult[];
  /** 全部处理完之后的最新基线 */
  baseline: Baseline;
}

/** 单次请求的 op 数上限。挡的是「一个请求做几十万次写盘」这类滥用 */
export const MAX_OPS_PER_REQUEST = 500;

export const isSaveOp = (value: unknown): value is SaveOp => {
  if (!isRecord(value)) return false;
  if (!isSaveKind(value.kind)) return false;
  if (value.id !== undefined && value.id !== null && typeof value.id !== "string") return false;
  if (value.op === "delete") return true;
  return value.op === "write" && value.data !== undefined;
};

/**
 * 一批 op 逐个落到磁盘，最后统一更新基线。
 *
 * **逐条隔离，整批不原子。** 写多个文件做不到跨文件事务，所以这里不假装能：
 * 每条独立成败由 `results` 如实报出，客户端只把成功的从待写队列里摘掉。
 * 基线的更新放在**全部 op 处理完之后**（一次写），因为它是「哪些内容已经落盘」
 * 的记录 —— 中途更新会让没写成功的条目被误记为已同步。
 *
 * 哈希由这里算，客户端直接采信返回值。算的是**刚写下去的那份内容**：调用方传进来的
 * 对象与 `JSON.parse(文件内容)` 在本项目的序列化规则下哈希相同（键序无关、`undefined`
 * 键丢弃、非有限数字变 `null`），所以客户端从磁盘重算也能得到同样的值 ——
 * `saves.test.ts` 有一条专门钉这个往返不变量的用例。
 */
export const applySaveOps = async (
  root: string,
  userId: unknown,
  ops: SaveOp[]
): Promise<ApplyResult> => {
  // userId 先一次性校验：它非法的话每条 op 都会失败，不如直接抛出去（路由映射成 400）。
  // 校验放在锁外 —— 非法输入不必排队
  const dir = resolveUserDir(root, userId);

  // 同一个用户的写盘串行执行，理由见 `withUserLock`
  return withUserLock(dir, () => runSaveOps(root, userId, ops));
};

const runSaveOps = async (
  root: string,
  userId: unknown,
  ops: SaveOp[]
): Promise<ApplyResult> => {
  const baseline = await readBaseline(root, userId);
  const results: OpResult[] = [];
  let changed = false;

  for (const op of ops) {
    const key = recordKey(op.kind, op.id);
    try {
      if (op.op === "write") {
        await writeSaveFile(root, userId, op.kind, op.id, op.data);
        const hash = await contentHash(op.data);
        baseline.records[key] = hash;
        results.push({ key, ok: true, hash });
      } else {
        await removeSaveFile(root, userId, op.kind, op.id);
        delete baseline.records[key];
        results.push({ key, ok: true });
      }
      changed = true;
    } catch (error) {
      // 一条坏数据不该让整批白写 —— 好的那几条照常落盘
      results.push({
        key,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (changed) {
    baseline.schemaVersion = SAVES_SCHEMA_VERSION;
    await writeBaseline(root, userId, baseline);
  }
  return { results, baseline };
};
