import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";
import type { SaveKind } from "./kinds";

/**
 * 「一个用户的数据快照」与「一次写盘操作」的**类型**。
 *
 * S3 之前这个文件是防抖镜像的全部逻辑（按引用相等算差分、攒批、去重）。那些机制随
 * 自动写盘一起退役了 —— 现在写盘只发生在五个明确时机上，差分也改成**按内容哈希**
 * （见 `session.ts` 的 `collectDirty`），因为引用相等跨不了刷新。
 *
 * 留下的是仍然共用的两个概念：
 * - `UserSnapshot`：三个 store 里属于某个用户的那一份切片（`readSnapshot` 的返回）
 * - `MirrorOp`：一次写盘操作，与服务端 `POST /api/saves` 的 `ops` 同形
 *
 * 文件名没改：改名的收益（好听）小于代价（动四个 import）。
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
