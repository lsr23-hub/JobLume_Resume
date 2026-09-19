import fs from "node:fs/promises";
import path from "node:path";
import type { SaveKind } from "@/lib/saves/kinds";

export { isSaveKind, SAVE_KINDS, type SaveKind } from "@/lib/saves/kinds";

/**
 * 默认存档目录：`<仓库根>/saves/<userId>/`。
 *
 * 定位：**浏览器 localStorage 仍是真相源，这里只是它的镜像**（见 plan/task_plan.md
 * 的决策）。用途是让数据在你硬盘上看得见、能进 git、能手改 —— 而不是取代浏览器存储。
 *
 * ⚠️ 安全边界：这是全项目唯一会**按请求往磁盘写文件**的地方。三层防护缺一不可：
 * 1. 路径片段只允许 uuid 那一类安全字符（见 `SAFE_SEGMENT`）——不含 `.`、`/`、`\`
 * 2. 拼完之后再用 `path.relative` 确认没跑出 `saves/`（纵深防御，防字符集被绕过）
 * 3. 写入只发生在 `saves/` 下，而静态文件服务的是 `dist/client`，两者不相交
 */
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
  if (!isSafeSegment(userId)) {
    throw new Error(`[saves] 非法的 userId：${String(userId).slice(0, 40)}`);
  }
  if (kind === "profile") {
    if (id !== undefined && id !== null) {
      throw new Error("[saves] profile 不接受 id");
    }
  } else if (!isSafeSegment(id)) {
    throw new Error(`[saves] 非法的 id：${String(id).slice(0, 40)}`);
  }

  const savesRoot = path.resolve(root, SAVES_DIRNAME);
  const fileName = kind === "profile" ? "profile.json" : `${id as string}.json`;
  const full = path.resolve(savesRoot, userId, SUBDIR[kind], fileName);

  // 纵深防御：上面的字符集已经堵死了 `..` 与分隔符，这里再确认一次最终路径
  // 确实落在 saves/ 之内。安全校验不该只有一层。
  const rel = path.relative(savesRoot, full);
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
  await fs.rm(full, { force: true });
  return full;
};
