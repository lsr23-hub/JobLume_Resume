import {
  normalizeProfileState,
  normalizeResumeState,
  normalizeTargetStateV2,
} from "@/store/userScope";
import { EMPTY_SNAPSHOT, type UserSnapshot } from "./mirror";
import { isEmptySnapshot } from "./tree";

/**
 * 从旧的 localStorage blob 里把数据捞出来。
 *
 * **这条通道不能省。** 三个 store 停止持久化之后，现有用户的数据仍然只存在于那
 * 三份 blob 里 —— 那是他们唯一的副本。不捞的话，升级即等于清空。
 *
 * 形状的权威仍是 `userScope.ts` 的归一化器（它们同时管 v0 / v1 / v2 的迁移），
 * 这里只负责「按 key 取出来、喂进去、按用户拼成快照」。
 */

export const LEGACY_KEYS = {
  profile: "career-profile-storage",
  resume: "resume-storage",
  targets: "job-target-storage",
} as const;

export type LegacyKind = keyof typeof LEGACY_KEYS;

export interface LegacyBlobs {
  profile: string | null;
  resume: string | null;
  targets: string | null;
}

export interface LegacyData {
  /** 按 userId 分好的快照，三个来源合在一起 */
  users: Record<string, UserSnapshot>;
  /** 旧档案 store 里记的「上次看的是谁」 */
  currentUserId: string | null;
}

/** 取出 `{ state, version }` 里的 `state`；坏 JSON 当成没有 */
const stateOf = (blob: string | null): unknown => {
  if (!blob) return undefined;
  try {
    const parsed = JSON.parse(blob);
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return (parsed as { state: unknown }).state;
    }
    // 没有 { state } 外壳的（手写/别的工具写的）也认，直接当 state 用
    return parsed;
  } catch {
    return undefined;
  }
};

export const snapshotFromLegacy = (blobs: LegacyBlobs): LegacyData => {
  const profiles = normalizeProfileState(stateOf(blobs.profile));
  const resumes = normalizeResumeState(stateOf(blobs.resume));
  const targets = normalizeTargetStateV2(stateOf(blobs.targets));

  const users: Record<string, UserSnapshot> = {};
  const ensure = (userId: string): UserSnapshot =>
    (users[userId] ||= { ...EMPTY_SNAPSHOT, resumes: {}, targets: {} });

  for (const [userId, profile] of Object.entries(profiles.profiles)) {
    ensure(userId).profile = profile;
  }
  for (const [userId, bucket] of Object.entries(resumes.byUser)) {
    ensure(userId).resumes = bucket;
  }
  for (const [userId, bucket] of Object.entries(targets.targetsByUser)) {
    ensure(userId).targets = bucket;
  }

  return { users, currentUserId: profiles.currentUserId };
};

/**
 * 要不要采纳这份遗留数据。
 *
 * **只在磁盘上这个用户什么都没有时**才采纳 —— 磁盘是真相源，它已经有内容就说明
 * 这份数据早就搬过去了（或者用户换过机器），拿本地的旧副本去覆盖它是倒退。
 */
export const shouldAdoptLegacy = (disk: UserSnapshot, legacy: UserSnapshot): boolean =>
  isEmptySnapshot(disk) && !isEmptySnapshot(legacy);

export const readLegacyBlobs = (): LegacyBlobs => {
  if (typeof window === "undefined") return { profile: null, resume: null, targets: null };
  return {
    profile: window.localStorage.getItem(LEGACY_KEYS.profile),
    resume: window.localStorage.getItem(LEGACY_KEYS.resume),
    targets: window.localStorage.getItem(LEGACY_KEYS.targets),
  };
};

/**
 * 清掉旧 key。
 *
 * **必须等这一批数据真的写进磁盘之后再清** —— 中途失败还能靠它再来一次。
 */
export const clearLegacyKeys = (): void => {
  if (typeof window === "undefined") return;
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 清不掉不影响正确性：下一次导入会走 shouldAdoptLegacy（磁盘已有内容 → 不再采纳）
    }
  }
};
