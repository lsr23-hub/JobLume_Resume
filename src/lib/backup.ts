import { collectImageRefs } from "@/lib/saves/images";
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
  /**
   * 导出时那个用户的姓名。
   *
   * **纯提示信息，不参与任何逻辑。** 存在的理由：多用户下「在 B 名下导入
   * A 的备份」会静默写进 B，而文件里原本没有任何线索能告诉用户这件事。
   * 可选（老备份没有），也绝不拿它做校验或匹配 —— 姓名会重复、会改。
   */
  profileOwner?: string;
  profile: CareerProfile | null;
  resumes: ResumeData[];
  targets: JobTarget[];
}

export interface BuildBackupInput {
  profile: CareerProfile | null;
  resumes: Record<string, ResumeData>;
  targets: Record<string, JobTarget>;
  now: string;
  /** 导出时当前用户的姓名，只写进文件供导入侧提示用 */
  ownerName?: string;
}

/**
 * 把简历里的凭据摘掉。
 *
 * 目前只有 `basic.githubKey`（GitHub personal access token，用于拉贡献日历）。
 *
 * **为什么导出必须摘**：这个字段跟着简历走，而简历是要给别人的 ——
 * 导出的 JSON 会发给招聘方、贴进 gist、存进公开仓库。带上 token 等于把
 * 一把能读写该用户仓库的钥匙一起送出去。备份文件同理，它落在下载目录、
 * 云盘、同步文件夹里，同样是明文静态存放。
 *
 * **为什么是摘掉而不是加密**：token 是用户随时能从 GitHub 重新生成的，
 * 丢了只是要重填一次，代价明确且可恢复；而泄漏是不可撤销的。
 *
 * ⚠️ **只在导出路径调用，不要用在 store 写入或存档镜像上** ——
 * 那两条路径上的 token 必须留着，否则贡献日历会当场失效。
 */
export const stripResumeCredentials = (
  resume: ResumeData
): ResumeData => ({
  ...resume,
  basic: { ...resume.basic, githubKey: "" },
});

export const buildBackup = (input: BuildBackupInput): BackupPayload => ({
  app: BACKUP_APP_ID,
  version: BACKUP_VERSION,
  exportedAt: input.now,
  profileOwner: input.ownerName?.trim() || undefined,
  profile: input.profile,
  // 简历里带 GitHub token，备份文件会被下载、云同步、发给同事 —— 摘掉
  resumes: Object.values(input.resumes).map(stripResumeCredentials),
  targets: Object.values(input.targets),
});

/**
 * 把姓名收拾成能进文件名的样子：去掉路径分隔符等危险字符，限长。
 * 中文名原样保留（`\p{L}` 覆盖汉字）。
 */
export const ownerSlug = (name: string | undefined): string => {
  // 反向写法（剔除文件名非法字符）而不是正向匹配 \p{L}：后者需要 `u` 标志，
  // 而本项目的 target 到不了 es6。汉字与字母天然会被保留下来。
  const cleaned = (name ?? "").replace(/[\\/:*?"<>|\s]+/g, "").slice(0, 16);
  return cleaned || "unnamed";
};

/** 备份内容的摘要，用于导入前告知用户将发生什么 */
export interface BackupSummary {
  hasProfile: boolean;
  /** 备份是谁导出的（老备份没有）。只用于提示 */
  ownerName?: string;
  entityCount: number;
  resumeCount: number;
  targetCount: number;
  exportedAt: string;
}

export const summarizeBackup = (payload: BackupPayload): BackupSummary => ({
  hasProfile: payload.profile !== null,
  ownerName: payload.profileOwner,
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

/**
 * 备份里引用了哪些图片（档案照片 / 简历照片 / 证书 url）。
 *
 * 打包 zip 时按这份清单去找字节；与**服务端孤儿回收**扫的是同一组字段
 * （见 `lib/server/saves.ts` 的 `collectReferencedImages`）—— 两处不一致会让
 * 「备份少图」或「盘上多垃圾」。图片只可能在这三处：富文本插不了图
 * （tiptap 依赖里没有 `extension-image`）。
 */
export const imagesInBackup = (payload: BackupPayload): string[] =>
  collectImageRefs([
    payload.profile?.basic?.photo,
    ...payload.resumes.flatMap((resume) => [
      resume.basic?.photo,
      ...(resume.certificates ?? []).map((certificate) => certificate.url),
    ]),
  ]);

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

// ─────────────────────────────────────────────────────────────
// 职业数据库档案（只含 profile，不含简历与投递目标）
// ─────────────────────────────────────────────────────────────

export interface ProfileArchive {
  app: typeof BACKUP_APP_ID;
  kind: "profile";
  version: number;
  exportedAt: string;
  /** 同 `BackupPayload.profileOwner` —— 纯提示，可选 */
  profileOwner?: string;
  profile: CareerProfile;
}

export const buildProfileArchive = (
  profile: CareerProfile,
  now: string,
  ownerName?: string
): ProfileArchive => ({
  app: BACKUP_APP_ID,
  kind: "profile",
  version: BACKUP_VERSION,
  exportedAt: now,
  profileOwner: ownerName?.trim() || undefined,
  profile,
});

/**
 * 从文件内容中取出职业数据库。
 *
 * 同时接受两种格式：
 * - 职业数据库档案（`kind: "profile"`，本模块导出）
 * - 全库备份（含简历与投递目标）—— 用户手上更可能存的是这一种
 *
 * 只取 `profile` 字段，其余部分由调用方决定是否处理。
 */
export const parseProfileArchive = (
  text: string
): {
  ok: true;
  profile: CareerProfile;
  source: "profile" | "backup";
  ownerName?: string;
} | { ok: false; error: string } => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是合法的 JSON" };
  }

  if (!isObject(raw)) return { ok: false, error: "文件内容不是对象" };
  if (raw.app !== BACKUP_APP_ID) return { ok: false, error: "这不是本工具导出的文件" };
  if (typeof raw.version === "number" && raw.version > BACKUP_VERSION) {
    return { ok: false, error: `文件版本 ${raw.version} 不受支持` };
  }
  if (!isObject(raw.profile)) {
    return { ok: false, error: "文件中不包含职业数据库" };
  }

  return {
    ok: true,
    profile: raw.profile as unknown as CareerProfile,
    source: raw.kind === "profile" ? "profile" : "backup",
    ownerName:
      typeof raw.profileOwner === "string" && raw.profileOwner.trim()
        ? raw.profileOwner.trim()
        : undefined,
  };
};
