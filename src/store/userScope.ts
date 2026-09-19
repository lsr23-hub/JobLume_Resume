/**
 * 多用户的作用域约定与三份持久化状态的迁移。
 *
 * 背景：改造前全站只有一个隐式的「我」——`career-profile-storage` 里一个标量
 * `profile`、`resume-storage` 里一个扁平 `resumes`、`job-target-storage` 里一套
 * 全局 `targets`，没有任何字段记录「这条数据属于谁」。
 *
 * 迁移只有一次（version 0 → 1），所以这里不做通用框架，只做这一件事。
 */
import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";
import { hasUsableProfile } from "@/lib/profile/hasUsableProfile";

/**
 * 迁移前的存量数据统一落在它名下。
 *
 * 刻意用**固定字面量**而不是 `crypto.randomUUID()`：三个 store 各自独立迁移，
 * 没有一个协调者。若各自生成 id，简历就会挂在一个档案不认识的用户名下。
 */
export const LEGACY_USER_ID = "legacy-default";

/** 目标版本。此前三个 store 都没有 version，盘上是 0 */
export const USER_SCOPE_VERSION = 1;

// ─────────────────────────── 形状守卫 ───────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 只认最低限度的骨架。字段级的补全交给 `syncBasicPresets` 那套惰性迁移 */
const looksLikeProfile = (v: unknown): v is CareerProfile =>
  isRecord(v) && isRecord(v.basic) && isRecord(v.entities);

const looksLikeResume = (v: unknown): v is ResumeData =>
  isRecord(v) && typeof v.id === "string";

// ─────────────────────────── 职业档案 ───────────────────────────

export interface ProfilePersisted {
  profiles: Record<string, CareerProfile>;
  currentUserId: string | null;
}

/**
 * version 0 → 1。
 *
 * 空档案**不进用户列表**：`ensureProfile()` 会在首次访问职业数据库时立刻写入
 * 一份空档案，所以升级上来的用户很可能「有一份档案但一个字都没有」。把它当成
 * 一个用户会让选择弹窗永远不出现，用户也就没有机会建第一个真正的人。
 */
export const migrateProfileState = (persisted: unknown, version: number): ProfilePersisted => {
  if (version !== 0) {
    // 只有 0 是已知的旧版本。将来若加了 v2 而没写对应分支，这里抛错比静默
    // 返回空结构安全 —— 抛错不会写盘，见 userScope 的模块注释与 persistGuard。
    throw new Error(`[userScope] 未知的 profile 持久化版本：${version}`);
  }

  const legacy = isRecord(persisted) ? persisted : {};
  const profile = legacy.profile;

  if (profile === null || profile === undefined) {
    return { profiles: {}, currentUserId: null };
  }
  if (!looksLikeProfile(profile)) {
    throw new Error("[userScope] career-profile-storage 里的 profile 形状无法识别");
  }
  if (!hasUsableProfile(profile)) {
    return { profiles: {}, currentUserId: null };
  }
  return { profiles: { [LEGACY_USER_ID]: profile }, currentUserId: LEGACY_USER_ID };
};

/**
 * `merge` 期的归一化 —— 与 `migrate` 不是二选一，两者都要。
 *
 * 为什么不能只靠 migrate：persist 的版本判据是 `typeof v.version === "number"`，
 * **版本字段缺失的 blob 根本不进 migrate**，会被原样交给 `merge`。正常存量数据
 * 因为 `setItem` 会写 `version: 0` 所以没事，但手改过 localStorage、或用别的工具
 * 写出来的 blob 会绕过 migrate。所以底下这一层必须自己站得住。
 */
export const normalizeProfileState = (persisted: unknown): ProfilePersisted => {
  if (!isRecord(persisted)) return { profiles: {}, currentUserId: null };

  // 已经是新形状
  if (isRecord(persisted.profiles)) {
    const profiles: Record<string, CareerProfile> = {};
    for (const [id, value] of Object.entries(persisted.profiles)) {
      if (looksLikeProfile(value)) profiles[id] = value;
    }
    const currentUserId =
      typeof persisted.currentUserId === "string" && profiles[persisted.currentUserId]
        ? persisted.currentUserId
        : null;
    return { profiles, currentUserId };
  }

  // 还会走到这里说明是绕过 migrate 的旧 blob —— 复用同一套降级规则
  const profile = persisted.profile;
  if (!looksLikeProfile(profile) || !hasUsableProfile(profile)) {
    return { profiles: {}, currentUserId: null };
  }
  return { profiles: { [LEGACY_USER_ID]: profile }, currentUserId: LEGACY_USER_ID };
};

// ─────────────────────────── 简历 ───────────────────────────

export interface ResumePersisted {
  byUser: Record<string, Record<string, ResumeData>>;
  activeByUser: Record<string, string | null>;
}

export const migrateResumeState = (persisted: unknown, version: number): ResumePersisted => {
  if (version !== 0) {
    throw new Error(`[userScope] 未知的 resume 持久化版本：${version}`);
  }

  const legacy = isRecord(persisted) ? persisted : {};
  const rawResumes = isRecord(legacy.resumes) ? legacy.resumes : {};

  const resumes: Record<string, ResumeData> = {};
  for (const [id, value] of Object.entries(rawResumes)) {
    if (looksLikeResume(value)) resumes[id] = value;
  }
  if (Object.keys(resumes).length === 0) {
    return { byUser: {}, activeByUser: {} };
  }

  const active = typeof legacy.activeResumeId === "string" && resumes[legacy.activeResumeId]
    ? legacy.activeResumeId
    : null;

  return {
    byUser: { [LEGACY_USER_ID]: resumes },
    activeByUser: { [LEGACY_USER_ID]: active },
  };
};

export const normalizeResumeState = (persisted: unknown): ResumePersisted => {
  if (!isRecord(persisted)) return { byUser: {}, activeByUser: {} };

  if (isRecord(persisted.byUser)) {
    const byUser: Record<string, Record<string, ResumeData>> = {};
    for (const [userId, value] of Object.entries(persisted.byUser)) {
      if (!isRecord(value)) continue;
      const slice: Record<string, ResumeData> = {};
      for (const [id, resume] of Object.entries(value)) {
        if (looksLikeResume(resume)) slice[id] = resume;
      }
      byUser[userId] = slice;
    }
    const activeByUser: Record<string, string | null> = {};
    const rawActive = isRecord(persisted.activeByUser) ? persisted.activeByUser : {};
    for (const userId of Object.keys(byUser)) {
      const candidate = rawActive[userId];
      activeByUser[userId] =
        typeof candidate === "string" && byUser[userId][candidate] ? candidate : null;
    }
    return { byUser, activeByUser };
  }

  return migrateResumeState(persisted, 0);
};

// ─────────────────────────── 投递目标 ───────────────────────────

/**
 * 岗位的**归属**按用户分，岗位本身（JD / 公司 / 职位）也跟着走。
 *
 * 演变史：v0 是全站一个全局 `targets`、每条岗位一个分析槽；v1 改成了
 * 「岗位全局共享、只有分析按人分」（`analysesByUser`）；v2 又把岗位本身也
 * 按用户隔离，于是分析塌回单槽。**v2 是简化不是又加一层** —— v1 那层
 * `analysesByUser` 存在的唯一理由就是「岗位共享但分析不共享」。
 */
export const TARGET_SCOPE_VERSION = 2;

/** v1 的岗位形状：分析按 userId 索引。**只存在于迁移路径上** */
type V1Target = Omit<JobTarget, "matchAnalysis" | "analysisCache"> & {
  analysesByUser: Record<string, MatchAnalysis>;
  cachesByUser: Record<string, AnalysisCache>;
};

export interface TargetPersistedV2 {
  targetsByUser: Record<string, Record<string, JobTarget>>;
}

/**
 * 只认最低限度的骨架（有个字符串 id）。字段级的补全交给下面两个收敛函数
 * —— 它们必须自己站得住，因为手改过的 localStorage 会绕过 migrate。
 */
const hasTargetId = (v: unknown): v is Record<string, unknown> & { id: string } =>
  isRecord(v) && typeof v.id === "string";

const looksLikeAnalysis = (v: unknown): v is MatchAnalysis =>
  isRecord(v) && isRecord(v.items) && Array.isArray(v.rankedIds) && isRecord(v.summary);

const looksLikeCache = (v: unknown): v is AnalysisCache =>
  isRecord(v) && typeof v.contentFingerprint === "string";

/**
 * 把一条目标收敛成 v1 形状（分析按用户索引）。
 *
 * 输入可能是 v0（单槽 `matchAnalysis` / `analysisCache`）或已经是 v1
 * （`analysesByUser` / `cachesByUser`）—— 两种都在这里抹平，调用方不必先判版本。
 * 幂等：已经是 v1 时原样保留；认不出的槽回落成空表（不是 undefined）。
 */
const asV1Target = (raw: Record<string, unknown>): V1Target => {
  const {
    analysesByUser: _a,
    cachesByUser: _c,
    matchAnalysis: _m,
    analysisCache: _k,
    ...rest
  } = raw;

  const analysesByUser: Record<string, MatchAnalysis> = {};
  const cachesByUser: Record<string, AnalysisCache> = {};

  if (isRecord(raw.analysesByUser)) {
    for (const [uid, a] of Object.entries(raw.analysesByUser)) {
      if (looksLikeAnalysis(a)) analysesByUser[uid] = a;
    }
  } else if (looksLikeAnalysis(raw.matchAnalysis)) {
    // v0 的单槽没有归属信息，只能归到迁移前那个隐式的「我」名下
    analysesByUser[LEGACY_USER_ID] = raw.matchAnalysis;
  }

  if (isRecord(raw.cachesByUser)) {
    for (const [uid, c] of Object.entries(raw.cachesByUser)) {
      if (looksLikeCache(c)) cachesByUser[uid] = c;
    }
  } else if (looksLikeCache(raw.analysisCache)) {
    cachesByUser[LEGACY_USER_ID] = raw.analysisCache;
  }

  return {
    ...(rest as unknown as Omit<JobTarget, "matchAnalysis" | "analysisCache">),
    analysesByUser,
    cachesByUser,
  };
};

/**
 * 把一条 v2 的目标收敛干净：认不出的分析槽回落成 null，
 * 顺带丢掉手改过的 blob 里可能残留的 v1 字段（那时两个槽就不该同时存在）。
 */
const asV2Target = (raw: Record<string, unknown>): JobTarget => {
  const { analysesByUser: _a, cachesByUser: _c, ...rest } = raw;
  return {
    ...(rest as unknown as JobTarget),
    matchAnalysis: looksLikeAnalysis(raw.matchAnalysis) ? raw.matchAnalysis : null,
    analysisCache: looksLikeCache(raw.analysisCache) ? raw.analysisCache : null,
  };
};

/** v0 / v1 的 blob → v1 的裸 map（不套壳，套壳由调用方决定） */
const toV1Targets = (persisted: unknown): Record<string, V1Target> => {
  const raw = isRecord(persisted) && isRecord(persisted.targets) ? persisted.targets : {};
  const out: Record<string, V1Target> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (hasTargetId(value)) out[id] = asV1Target(value);
  }
  return out;
};

/**
 * v1 → v2 是**扇出**，不是改名：v1 里一条岗位可能挂着多个用户的分析，
 * v2 要按分析的所有者拆成多份岗位副本，每人一份、各带自己的分析。
 *
 * 没被任何人分析过的岗位无法判断归属，归到 `LEGACY_USER_ID`。
 *
 * 同时接受 v0（从未迁移过）与 v1。抛错规则与其它 migrate 一致：遇未知版本抛错，
 * 而不是返回空结构 —— 抛错不写盘，返回空结构会把空数据当成迁移结果提交。
 */
export const migrateTargetStateV2 = (persisted: unknown, version: number): TargetPersistedV2 => {
  if (version > TARGET_SCOPE_VERSION) {
    throw new Error(`[userScope] 未知的 job target 持久化版本：${version}`);
  }

  // 已经是 v2 就别再扇出一次（正常路径下 migrate 不会以 v2 被调用 ——
  // 版本一致时 persist 根本不调 migrate；这里是防手改 storage 的兜底）
  if (version >= TARGET_SCOPE_VERSION) return normalizeTargetStateV2(persisted);

  return { targetsByUser: fanOut(toV1Targets(persisted)) };
};

const fanOut = (v1: Record<string, V1Target>): Record<string, Record<string, JobTarget>> => {
  const targetsByUser: Record<string, Record<string, JobTarget>> = {};
  const put = (userId: string, id: string, target: JobTarget) => {
    (targetsByUser[userId] ||= {})[id] = target;
  };

  for (const [id, target] of Object.entries(v1)) {
    const { analysesByUser, cachesByUser, ...rest } = target;
    const owners = Object.keys(analysesByUser);

    if (owners.length === 0) {
      put(LEGACY_USER_ID, id, { ...rest, matchAnalysis: null, analysisCache: null });
      continue;
    }
    for (const owner of owners) {
      put(owner, id, {
        ...rest,
        matchAnalysis: analysesByUser[owner] ?? null,
        analysisCache: cachesByUser[owner] ?? null,
      });
    }
  }
  return targetsByUser;
};

/**
 * v2 的 merge 期归一化：版本字段缺失的 blob 根本不进 migrate，会落到这里。
 *
 * 判据是 `typeof v.version === "number"`，所以「手改过 / 别的工具写出」的
 * blob 绕过 migrate 是常态 —— 这一层必须自己站得住。
 */
export const normalizeTargetStateV2 = (persisted: unknown): TargetPersistedV2 => {
  if (!isRecord(persisted)) return { targetsByUser: {} };

  if (isRecord(persisted.targetsByUser)) {
    const targetsByUser: Record<string, Record<string, JobTarget>> = {};
    for (const [userId, bucket] of Object.entries(persisted.targetsByUser)) {
      if (!isRecord(bucket)) continue;
      const clean: Record<string, JobTarget> = {};
      for (const [id, raw] of Object.entries(bucket)) {
        if (hasTargetId(raw)) clean[id] = asV2Target(raw);
      }
      targetsByUser[userId] = clean;
    }
    return { targetsByUser };
  }

  // 绕过 migrate 的旧 blob（v0 / v1）—— 复用同一套扇出规则
  return migrateTargetStateV2(persisted, 0);
};

/**
 * 把**备份文件里**的一条目标收敛成 v2 形状，归属取指定的那个用户。
 *
 * 备份文件不带形状标记，可能来自三个时代：
 * - v0：单槽 `matchAnalysis` / `analysisCache`
 * - v1：`analysesByUser` / `cachesByUser`
 * - v2：单槽（与 v0 同名，但已经是收敛过的）
 *
 * 三种都过一遍 `asV1Target` 抹平，再**只取该用户那一份**。v1 那条路上如果
 * 这个用户没有分析，导进来就是「还没分析过」，而不是把别人的结论顶上来。
 * 认不出形状的返回 null，由调用方丢弃。
 */
export const normalizeImportedTarget = (raw: unknown, userId: string): JobTarget | null => {
  if (!hasTargetId(raw)) return null;

  const rawRecord = raw as Record<string, unknown>;
  // v1 才有按用户索引的那层；没有它就说明分析是单槽的（v0 或 v2），
  // 而 `asV1Target` 会把单槽归到 LEGACY_USER_ID 名下
  const perUser = isRecord(rawRecord.analysesByUser) || isRecord(rawRecord.cachesByUser);
  const { analysesByUser, cachesByUser, ...rest } = asV1Target(rawRecord);
  const owner = perUser ? userId : LEGACY_USER_ID;

  return {
    ...rest,
    matchAnalysis: analysesByUser[owner] ?? null,
    analysisCache: cachesByUser[owner] ?? null,
  };
};

/** 读某个用户名下的全部岗位；没选用户时给空表 */
export const targetsOf = (
  persisted: TargetPersistedV2,
  userId: string | null | undefined
): Record<string, JobTarget> => (userId ? persisted.targetsByUser[userId] ?? {} : {});
