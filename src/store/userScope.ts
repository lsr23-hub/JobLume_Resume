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

const looksLikeTarget = (v: unknown): v is JobTarget =>
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
 * 岗位的**分析**按用户分开存，岗位本身（JD / 公司 / 职位）保持全局共享 ——
 * 多个用户可以投同一个岗位，但「这条要求由哪几段经历支撑」只对某一个人成立。
 *
 * 字段留在 `JobTarget` 上（而不是提到 store 根），因为 store 的 `targets` 已经
 * 按 targetId 索引了，提到根上会丢掉 target 这一维。
 */
export interface TargetScopedAnalysis {
  analysesByUser: Record<string, MatchAnalysis>;
  cachesByUser: Record<string, AnalysisCache>;
}

/**
 * 迁移与读写辅助统一用这个别名。
 *
 * 它曾经是一个交叉类型（`JobTarget & TargetScopedAnalysis`）—— 那时 `JobTarget`
 * 上还留着旧的单槽字段、读取方没切完，需要一个过渡缝。现在 `JobTarget` 本身就
 * 声明了 `analysesByUser` / `cachesByUser`，缝已经收掉，保留别名只是让上面那些
 * 签名不必逐个改。
 */
export type ScopedJobTarget = JobTarget;

const looksLikeAnalysis = (v: unknown): v is MatchAnalysis =>
  isRecord(v) && isRecord(v.items) && Array.isArray(v.rankedIds) && isRecord(v.summary);

const looksLikeCache = (v: unknown): v is AnalysisCache =>
  isRecord(v) && typeof v.contentFingerprint === "string";

/**
 * migrate 的返回值必须是**持久化切片的形状**，即 `{ targets }`，不是 targets 本身
 * —— persist 会把它直接交给 `merge` 的 `persistedState`，而 `partialize` 写出去的
 * 就是 `{ targets }`。返回裸 map 会让每个岗位凭空消失（而且不报错）。
 */
export const migrateTargetState = (
  persisted: unknown,
  version: number
): { targets: Record<string, ScopedJobTarget> } => {
  if (version !== 0) {
    throw new Error(`[userScope] 未知的 job target 持久化版本：${version}`);
  }
  return { targets: rewriteTargets(persisted) };
};

export const normalizeTargetState = (persisted: unknown): Record<string, ScopedJobTarget> => {
  if (isRecord(persisted) && isRecord(persisted.targets)) {
    // 已迁移过：逐条确认带上了 per-user 的分析字段
    const out: Record<string, ScopedJobTarget> = {};
    for (const [id, value] of Object.entries(persisted.targets)) {
      if (looksLikeTarget(value)) out[id] = withScopedAnalysis(value);
    }
    return out;
  }
  return rewriteTargets(persisted);
};

/** 旧目标：单个 `matchAnalysis` / `analysisCache` → 归到 LEGACY_USER_ID 名下 */
const rewriteTargets = (persisted: unknown): Record<string, ScopedJobTarget> => {
  const raw = isRecord(persisted) && isRecord(persisted.targets) ? persisted.targets : {};
  const out: Record<string, ScopedJobTarget> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (looksLikeTarget(value)) out[id] = withScopedAnalysis(value);
  }
  return out;
};

/**
 * 把一条目标上的分析收敛成 per-user 形状。
 *
 * 幂等：已经有 `analysesByUser` 时原样返回（保留新形状），否则把旧的单槽
 * 挪进 `LEGACY_USER_ID`。不认识的输入回落到「这个岗位还没分析过」。
 */
const withScopedAnalysis = (target: JobTarget): ScopedJobTarget => {
  const loose = target as unknown as Record<string, unknown>;

  if (isRecord(loose.analysesByUser) || isRecord(loose.cachesByUser)) {
    const analysesByUser: Record<string, MatchAnalysis> = {};
    const cachesByUser: Record<string, AnalysisCache> = {};
    if (isRecord(loose.analysesByUser)) {
      for (const [uid, a] of Object.entries(loose.analysesByUser)) {
        if (looksLikeAnalysis(a)) analysesByUser[uid] = a;
      }
    }
    if (isRecord(loose.cachesByUser)) {
      for (const [uid, c] of Object.entries(loose.cachesByUser)) {
        if (looksLikeCache(c)) cachesByUser[uid] = c;
      }
    }
    return { ...target, analysesByUser, cachesByUser };
  }

  const analysesByUser: Record<string, MatchAnalysis> = {};
  const cachesByUser: Record<string, AnalysisCache> = {};
  if (looksLikeAnalysis(loose.matchAnalysis)) {
    analysesByUser[LEGACY_USER_ID] = loose.matchAnalysis;
  }
  if (looksLikeCache(loose.analysisCache)) {
    cachesByUser[LEGACY_USER_ID] = loose.analysisCache;
  }
  return { ...target, analysesByUser, cachesByUser };
};

/** 读一条岗位对某个用户的当前分析（没有就是 null） */
export const analysisFor = (
  target: ScopedJobTarget | null | undefined,
  userId: string | null
): MatchAnalysis | null => (target && userId ? target.analysesByUser[userId] ?? null : null);

/** 读一条岗位对某个用户的当前缓存 */
export const cacheFor = (
  target: ScopedJobTarget | null | undefined,
  userId: string | null
): AnalysisCache | null => (target && userId ? target.cachesByUser[userId] ?? null : null);

/** 写一条岗位对某个用户的分析，返回新的 target（不就地改） */
export const withAnalysisFor = (
  target: ScopedJobTarget,
  userId: string,
  analysis: MatchAnalysis,
  cache: AnalysisCache
): ScopedJobTarget => ({
  ...target,
  analysesByUser: { ...target.analysesByUser, [userId]: analysis },
  cachesByUser: { ...target.cachesByUser, [userId]: cache },
});

/** 删掉某个用户时，连带清掉他在每条岗位上留下的分析 */
export const withoutUserAnalyses = (target: ScopedJobTarget, userId: string): ScopedJobTarget => {
  const { [userId]: _a, ...analysesByUser } = target.analysesByUser;
  const { [userId]: _c, ...cachesByUser } = target.cachesByUser;
  return { ...target, analysesByUser, cachesByUser };
};

// ─────────────────────── 投递目标 v2：岗位本身也按用户隔离 ───────────────────────

/**
 * v2 起，**岗位本身按用户隔离**（决策见 `plan/task_plan.md`）。
 *
 * v1 的模型是「岗位全局共享，只有分析按人分」（`analysesByUser`）。改成岗位也
 * 跟随用户之后，每个岗位副本只属于一个人、只需要一个分析槽 —— 于是
 * `analysesByUser` / `cachesByUser` 塌回 `matchAnalysis` / `analysisCache`。
 *
 * 这是**简化**而不是又加一层：v1 那层 `analysesByUser` 存在的唯一理由就是
 * 「岗位共享但分析不共享」，前提没了，层也就该没了。
 */
export const TARGET_SCOPE_VERSION = 2;

/** v2 的单个岗位：一个分析槽，因为这份岗位只属于一个人 */
export interface TargetSingleSlot {
  matchAnalysis: MatchAnalysis | null;
  analysisCache: AnalysisCache | null;
}

/**
 * v2 的岗位形状。
 *
 * 用 `Omit` 排掉 v1 的 `analysesByUser` / `cachesByUser`：`JobTarget` 接口上
 * 目前仍声明着那两个字段（读取方还没全切到 v2），而 v2 的副本一个分析槽就够。
 * 等第 4 步把 `types/jobTarget.ts` 改成单槽之后，这个交叉类型即可收敛成
 * `JobTarget` 本身 —— 与上一轮 `ScopedJobTarget` 同样的过渡手法。
 */
export type ScopedTargetV2 = Omit<JobTarget, "analysesByUser" | "cachesByUser"> &
  TargetSingleSlot;

export interface TargetPersistedV2 {
  targetsByUser: Record<string, Record<string, ScopedTargetV2>>;
}

/**
 * v1 → v2 是**扇出**，不是改名：v1 里一条岗位可能挂着多个用户的分析，
 * v2 要按分析的所有者拆成多份岗位副本，每人一份、各带自己的分析。
 *
 * 没被任何人分析过的岗位无法判断归属，归到 `LEGACY_USER_ID`。
 *
 * 同时接受 v0（从未迁移过）与 v1。抛错规则与其它 migrate 一致：遇未知版本抛错，
 * 而不是返回空结构 —— 抛错不写盘，返回空结构会把空数据当成迁移结果提交。
 */
export const migrateTargetStateV2 = (
  persisted: unknown,
  version: number
): TargetPersistedV2 => {
  if (version > TARGET_SCOPE_VERSION) {
    throw new Error(`[userScope] 未知的 job target 持久化版本：${version}`);
  }

  // 已经是 v2 就别再扇出一次（正常路径下 migrate 不会以 v2 被调用 ——
  // 版本一致时 persist 根本不调 migrate；这里是防手改 storage 的兜底）
  if (version >= TARGET_SCOPE_VERSION) return normalizeTargetStateV2(persisted);

  // 其余统一成 v1 的形状（Record<targetId, ScopedJobTarget>）：v0 先过一遍 v0→v1
  const v1: Record<string, ScopedJobTarget> =
    version === 0
      ? migrateTargetState(persisted, 0).targets
      : normalizeTargetState(persisted);

  const targetsByUser: Record<string, Record<string, ScopedTargetV2>> = {};
  const put = (userId: string, id: string, target: ScopedTargetV2) => {
    if (!targetsByUser[userId]) targetsByUser[userId] = {};
    targetsByUser[userId][id] = target;
  };

  for (const [id, target] of Object.entries(v1)) {
    const { analysesByUser, cachesByUser, ...rest } = target;
    const owners = Object.keys(analysesByUser ?? {});

    if (owners.length === 0) {
      put(LEGACY_USER_ID, id, { ...rest, matchAnalysis: null, analysisCache: null });
      continue;
    }
    for (const owner of owners) {
      put(owner, id, {
        ...rest,
        matchAnalysis: analysesByUser[owner] ?? null,
        analysisCache: cachesByUser?.[owner] ?? null,
      });
    }
  }

  return { targetsByUser };
};

/** v2 的 merge 期归一化：版本字段缺失的 blob 根本不进 migrate，会落到这里 */
export const normalizeTargetStateV2 = (persisted: unknown): TargetPersistedV2 => {
  if (!isRecord(persisted)) return { targetsByUser: {} };

  if (isRecord(persisted.targetsByUser)) {
    const targetsByUser: Record<string, Record<string, ScopedTargetV2>> = {};
    for (const [userId, bucket] of Object.entries(persisted.targetsByUser)) {
      if (!isRecord(bucket)) continue;
      const clean: Record<string, ScopedTargetV2> = {};
      for (const [id, target] of Object.entries(bucket)) {
        if (looksLikeTarget(target)) {
          clean[id] = {
            ...(target as JobTarget),
            matchAnalysis: looksLikeAnalysis((target as never as TargetSingleSlot).matchAnalysis)
              ? (target as never as TargetSingleSlot).matchAnalysis
              : null,
            analysisCache: looksLikeCache((target as never as TargetSingleSlot).analysisCache)
              ? (target as never as TargetSingleSlot).analysisCache
              : null,
          };
        }
      }
      targetsByUser[userId] = clean;
    }
    return { targetsByUser };
  }

  // 绕过 migrate 的旧 blob（v0 / v1）—— 复用同一套扇出规则
  return migrateTargetStateV2(persisted, 0);
};

/** 读某个用户名下的全部岗位 */
export const targetsOf = (
  persisted: TargetPersistedV2,
  userId: string | null | undefined
): Record<string, ScopedTargetV2> => (userId ? persisted.targetsByUser[userId] ?? {} : {});
