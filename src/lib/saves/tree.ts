import {
  normalizeProfileState,
  normalizeResumeState,
  normalizeTargetStateV2,
} from "@/store/userScope";
import { parseBaseline, type Baseline } from "./baseline";
import { EMPTY_SNAPSHOT, type UserSnapshot } from "./mirror";

/**
 * 把 `GET /api/saves` 的响应解析成「每个用户一份快照」。
 *
 * **纯函数**：不做 IO、不碰 store，所以形状守卫可以脱离浏览器直接测。
 *
 * 消费它的是两条路径：S3 用它拿**基线**（判断哪些改动还没落盘），S4 用它做
 * 完整的启动对账（连数据一起读回来）。
 *
 * ⚠️ 目前只接了基线那一半 —— 数据那一半（`snapshot`）还没有消费者，不要以为
 * 「从磁盘读回数据」已经生效。
 *
 * schema 的唯一权威是 `userScope.ts` 那三个归一化器（它们同时管旧版本迁移），
 * 这里只负责「喂进去、比对前后差集」，把**被丢掉的条目报出来**。静默丢弃是危险的：
 * 用户的数据会在界面上凭空消失，而磁盘上那份还在，两边从此对不上，而用户不知道。
 */

/** 归一化器按 userId 取键，这里只需要一个占位；不参与任何比较 */
const PROBE_KEY = "_";

export interface ParsedUser {
  snapshot: UserSnapshot;
  /**
   * 同步基线：每条记录上次写盘时的内容哈希。客户端靠它算「哪些改动还没落盘」。
   *
   * 服务端读不出来时会给空基线 + 一条 `baseline` 的 problem，这里照原样传下去。
   */
  baseline: Baseline;
  /** 读不出来的条目：服务端报的（不是合法 JSON）+ 客户端归一化时丢掉的（形状不对） */
  problems: string[];
}

export interface ParsedSaveTree {
  /** 服务端上的存档目录绝对路径，用于界面提示「数据存在哪」 */
  root: string;
  users: Record<string, ParsedUser>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 前后差集：归一化器丢掉的就是这些 key */
const droppedKeys = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(before).filter((k) => !(k in after));

const parseUser = (raw: Record<string, unknown>): ParsedUser => {
  const problems: string[] = [];
  if (Array.isArray(raw.problems)) {
    for (const p of raw.problems) if (typeof p === "string") problems.push(p);
  }

  // ── 档案：一个用户只有一份，坏了就是这一份坏了 ──
  const profileRaw = raw.profile;
  const profile = profileRaw === null || profileRaw === undefined
    ? null
    : normalizeProfileState({ profiles: { [PROBE_KEY]: profileRaw }, currentUserId: null })
        .profiles[PROBE_KEY] ?? null;
  if (profileRaw !== null && profileRaw !== undefined && profile === null) {
    problems.push("profile");
  }

  // ── 简历 ──
  const resumesRaw = isRecord(raw.resumes) ? raw.resumes : {};
  const resumes = normalizeResumeState({ byUser: { [PROBE_KEY]: resumesRaw } })
    .byUser[PROBE_KEY] ?? {};
  for (const id of droppedKeys(resumesRaw, resumes)) problems.push(`resume:${id}`);

  // ── 投递目标 ──
  const targetsRaw = isRecord(raw.targets) ? raw.targets : {};
  const targets = normalizeTargetStateV2({ targetsByUser: { [PROBE_KEY]: targetsRaw } })
    .targetsByUser[PROBE_KEY] ?? {};
  for (const id of droppedKeys(targetsRaw, targets)) problems.push(`jd:${id}`);

  return {
    snapshot: { ...EMPTY_SNAPSHOT, profile, resumes, targets },
    baseline: parseBaseline(raw.baseline),
    problems: problems.sort(),
  };
};

export const parseSaveTreeResponse = (raw: unknown): ParsedSaveTree => {
  if (!isRecord(raw) || raw.ok !== true || !isRecord(raw.users)) {
    return { root: "", users: {} };
  }

  const users: Record<string, ParsedUser> = {};
  for (const [userId, value] of Object.entries(raw.users)) {
    if (isRecord(value)) users[userId] = parseUser(value);
  }

  return { root: typeof raw.root === "string" ? raw.root : "", users };
};

/** 这个用户的快照是不是空的（用来判断要不要采纳遗留数据，见 legacy.ts） */
export const isEmptySnapshot = (s: UserSnapshot): boolean =>
  s.profile === null && Object.keys(s.resumes).length === 0 && Object.keys(s.targets).length === 0;
