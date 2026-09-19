import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";
import type { SaveKind } from "./kinds";

/**
 * 把浏览器里的数据镜像到 `<仓库根>/saves/<userId>/` 的**纯逻辑**。
 *
 * 这里只算「哪些文件该写、哪些该删」，不发请求 —— 发请求那半在
 * `hooks/useSavesMirror.ts`。分开是为了让差分逻辑可以脱离浏览器直接测。
 *
 * 真相源是 localStorage，镜像只单向从浏览器流向磁盘。所以磁盘上手改过的内容
 * 会被下一次同步覆盖，这是设计的一部分（见 plan/task_plan.md 的决策 1）。
 */

/** 一个用户在三个 store 里各自那一份持久化切片 */
export interface UserSnapshot {
  profile: CareerProfile | null;
  resumes: Record<string, ResumeData>;
  targets: Record<string, JobTarget>;
}

export const EMPTY_SNAPSHOT: UserSnapshot = { profile: null, resumes: {}, targets: {} };

export interface MirrorWrite {
  op: "write";
  kind: SaveKind;
  /** profile 没有 id（一个用户只有一份） */
  id?: string;
  data: unknown;
}

export interface MirrorDelete {
  op: "delete";
  kind: SaveKind;
  id?: string;
}

export type MirrorOp = MirrorWrite | MirrorDelete;

/**
 * 同一条存档的唯一键。
 *
 * 攒批时用它去重 —— 同一个文件在防抖窗口里被改三次，只留最后那一次。
 */
export const mirrorKey = (op: MirrorOp): string => `${op.kind}:${op.id ?? ""}`;

/**
 * 比对两次快照，得出该写哪些文件、删哪些文件。
 *
 * 判等用**引用相等**：三个 store 的写入都会给变动的那一条换新对象、没动过的
 * 保持同一个引用（`{ ...state, [id]: next }`），所以引用不同就是内容变了。
 * 也因此不必做深比较 —— 深比较在简历这种嵌套结构上又贵又容易漏。
 */
export const diffSnapshot = (prev: UserSnapshot, next: UserSnapshot): MirrorOp[] => {
  const ops: MirrorOp[] = [];

  if (prev.profile !== next.profile) {
    ops.push(
      next.profile
        ? { op: "write", kind: "profile", data: next.profile }
        : { op: "delete", kind: "profile" }
    );
  }

  pushMapDiff(ops, "resume", prev.resumes, next.resumes);
  pushMapDiff(ops, "jd", prev.targets, next.targets);
  return ops;
};

const pushMapDiff = (
  ops: MirrorOp[],
  kind: SaveKind,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): void => {
  for (const [id, value] of Object.entries(next)) {
    if (prev[id] !== value) ops.push({ op: "write", kind, id, data: value });
  }
  // 删掉的条目必须跟着删文件，否则磁盘上会留下一份永远对不上的旧数据
  for (const id of Object.keys(prev)) {
    if (!(id in next)) ops.push({ op: "delete", kind, id });
  }
};

/** 把攒批里的 op 合并进待发队列：同一个键后到的覆盖先到的 */
export const mergePending = (
  pending: Map<string, MirrorOp>,
  ops: MirrorOp[]
): Map<string, MirrorOp> => {
  const merged = new Map(pending);
  for (const op of ops) merged.set(mirrorKey(op), op);
  return merged;
};
