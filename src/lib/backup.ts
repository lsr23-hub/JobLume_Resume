import type { CareerProfile } from "@/types/profile";
import type { JobTarget } from "@/types/jobTarget";
import type { ResumeData } from "@/types/resume";

/**
 * 全库备份：职业数据库 + 全部简历 + 全部投递目标。
 *
 * 三者通过 `ResumeData.snapshot.jobTargetId` 与 `sourceMap` 关联，
 * 必须整体导出/导入才能保持关系完整 —— 单独导出任何一部分都会断链。
 */

export const BACKUP_APP_ID = "joblume-resume";
export const BACKUP_VERSION = 1;

export interface BackupPayload {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  profile: CareerProfile | null;
  resumes: ResumeData[];
  targets: JobTarget[];
}

export interface BuildBackupInput {
  profile: CareerProfile | null;
  resumes: Record<string, ResumeData>;
  targets: Record<string, JobTarget>;
  now: string;
}

export const buildBackup = (input: BuildBackupInput): BackupPayload => ({
  app: BACKUP_APP_ID,
  version: BACKUP_VERSION,
  exportedAt: input.now,
  profile: input.profile,
  resumes: Object.values(input.resumes),
  targets: Object.values(input.targets),
});

/** 备份内容的摘要，用于导入前告知用户将发生什么 */
export interface BackupSummary {
  hasProfile: boolean;
  entityCount: number;
  resumeCount: number;
  targetCount: number;
  exportedAt: string;
}

export const summarizeBackup = (payload: BackupPayload): BackupSummary => ({
  hasProfile: payload.profile !== null,
  entityCount: Object.keys(payload.profile?.entities ?? {}).length,
  resumeCount: payload.resumes.length,
  targetCount: payload.targets.length,
  exportedAt: payload.exportedAt,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 解析并校验备份文件。
 *
 * 只做**结构性校验**（是不是本工具的备份、三个集合是不是数组），
 * 不逐字段校验 —— 那需要一整套 schema 校验器，而备份来自本工具自身，
 * 结构可信。版本不匹配时拒绝，避免用旧结构覆盖新数据。
 */
export const parseBackup = (
  text: string
): { ok: true; payload: BackupPayload } | { ok: false; error: string } => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是合法的 JSON" };
  }

  if (!isObject(raw)) return { ok: false, error: "备份内容不是对象" };
  if (raw.app !== BACKUP_APP_ID) return { ok: false, error: "这不是本工具导出的备份文件" };
  if (typeof raw.version !== "number" || raw.version > BACKUP_VERSION) {
    return { ok: false, error: `备份版本 ${String(raw.version)} 不受支持` };
  }
  if (!Array.isArray(raw.resumes) || !Array.isArray(raw.targets)) {
    return { ok: false, error: "备份缺少简历或投递目标列表" };
  }
  // 缺失与 null 都表示「这份备份不含职业数据库」，只有存在但类型不对才拒绝
  if (raw.profile !== undefined && raw.profile !== null && !isObject(raw.profile)) {
    return { ok: false, error: "备份中的职业数据库格式不正确" };
  }

  return {
    ok: true,
    payload: {
      app: BACKUP_APP_ID,
      version: raw.version,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      profile: (raw.profile as CareerProfile | null) ?? null,
      resumes: raw.resumes as ResumeData[],
      targets: raw.targets as JobTarget[],
    },
  };
};

export interface MergeResult<T> {
  merged: Record<string, T>;
  added: number;
  /** id 已存在而被跳过的条目数 */
  skipped: number;
}

/**
 * 合并导入：只收下 id 不冲突的条目，冲突的跳过。
 *
 * 刻意不做「重新生成 id + 重建 sourceMap」——那会让同一个逻辑条目的
 * 历史简历与数据库脱钩，且结果难以向用户解释。冲突即跳过，语义清晰。
 */
export const mergeById = <T extends { id: string }>(
  existing: Record<string, T>,
  incoming: T[]
): MergeResult<T> => {
  const merged = { ...existing };
  let added = 0;
  let skipped = 0;

  for (const item of incoming) {
    if (!item?.id || item.id in merged) {
      skipped += 1;
      continue;
    }
    merged[item.id] = item;
    added += 1;
  }

  return { merged, added, skipped };
};

/** 预估备份大小，导出前提示用 */
export const estimateBackupSize = (payload: BackupPayload): number =>
  new Blob([JSON.stringify(payload)]).size;
