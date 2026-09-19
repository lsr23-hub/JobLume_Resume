import fs from "node:fs/promises";
import path from "node:path";
import type { SaveKind } from "@/lib/saves/kinds";

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

  await fs.writeFile(full, body, "utf8");
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

  return {
    profile: await readOne("profile"),
    resumes: await readCollection("resume"),
    targets: await readCollection("jd"),
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

/**
 * 删掉一个用户的整个存档目录。
 *
 * **这是全项目唯一一处递归删除**，所以单独写一段理由：存档成为唯一真相源之后，
 * 在应用里删掉一个用户却不删目录，下次启动他会从磁盘上**复活**（连同简历与岗位）。
 * 单文件删除做不到这件事。
 *
 * 边界收得比别处更紧：只接受一个路径片段，仍走 `isSafeSegment` + `path.relative`
 * 复核；**不接受客户端直接传路径**，调用方只能是服务器自己。
 */
export const removeUserDir = async (root: string, userId: unknown): Promise<string> => {
  const full = resolveUserDir(root, userId);
  await fs.rm(full, { recursive: true, force: true });
  return full;
};
