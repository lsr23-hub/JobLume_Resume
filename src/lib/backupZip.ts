import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { BACKUP_APP_ID, BACKUP_VERSION, parseBackup, type BackupPayload } from "./backup";
import { isImageFileName } from "./saves/images";

/**
 * 全库备份的**容器格式**：一个 zip。
 *
 * 为什么不再用单个 JSON：图片二进制没法好好待在 JSON 里。内联 base64 会让文件膨胀
 * 三分之一、而且图与数据搅在一起没法单独取用；不内联则备份不完整（换台机器照片就没了，
 * 那正是缺口 2）。
 *
 * 目录形状 —— **人能看懂**是刻意的，用户会打开它确认里面有什么：
 *
 * ```
 * manifest.json      这份备份是什么、有多少东西（人看；也是导入时的版本判据）
 * backup.json        数据本身（与旧的单 JSON 备份同形）
 * images/<name>      图片原始字节，文件名就是数据里引用的那个
 * ```
 */

export const MANIFEST_JSON = "manifest.json";
export const BACKUP_JSON = "backup.json";
export const IMAGES_PREFIX = "images/";

export interface BackupManifest {
  app: typeof BACKUP_APP_ID;
  kind: "zip";
  version: number;
  exportedAt: string;
  counts: { resumes: number; targets: number; images: number };
}

export interface BuiltZip {
  bytes: Uint8Array;
  manifest: BackupManifest;
}

/**
 * 打包。`images` 是「文件名 → 原始字节」—— 调用方负责去找字节（缓存或磁盘），
 * 这里只管装箱，所以是纯函数、可以直接测。
 */
export const buildBackupZip = (input: {
  payload: BackupPayload;
  images: Record<string, Uint8Array>;
  manifestVersion?: number;
}): BuiltZip => {
  const manifest: BackupManifest = {
    app: BACKUP_APP_ID,
    kind: "zip",
    version: input.manifestVersion ?? BACKUP_VERSION,
    exportedAt: input.payload.exportedAt,
    counts: {
      resumes: input.payload.resumes.length,
      targets: input.payload.targets.length,
      images: Object.keys(input.images).length,
    },
  };

  const files: Record<string, Uint8Array> = {
    [MANIFEST_JSON]: strToU8(JSON.stringify(manifest, null, 2)),
    [BACKUP_JSON]: strToU8(JSON.stringify(input.payload, null, 2)),
  };
  for (const [name, bytes] of Object.entries(input.images)) {
    // 只收合法图片名：一个被改过的 zip 不该把任意路径塞进解包结果
    if (isImageFileName(name)) files[`${IMAGES_PREFIX}${name}`] = bytes;
  }

  return { bytes: zipSync(files), manifest };
};

export type ParsedZip =
  | { ok: true; payload: BackupPayload; images: Record<string, Uint8Array>; manifest: unknown }
  | { ok: false; error: string };

/**
 * 解开一个备份 zip。
 *
 * 校验只做**结构性**的（是不是 zip、有没有 `backup.json`、payload 是不是本工具的、
 * 图片名合不合法）—— 逐字段校验需要一整套 schema，而备份来自本工具自身。
 * 版本判据复用 `parseBackup`（它已经会拒绝更高的版本）。
 */
export const parseBackupZip = (bytes: Uint8Array): ParsedZip => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, error: "文件不是合法的 zip" };
  }

  const payloadBytes = files[BACKUP_JSON];
  if (!payloadBytes) return { ok: false, error: "zip 里没有 backup.json" };

  const parsed = parseBackup(strFromU8(payloadBytes));
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const images: Record<string, Uint8Array> = {};
  for (const [path, data] of Object.entries(files)) {
    if (!path.startsWith(IMAGES_PREFIX)) continue;
    const name = path.slice(IMAGES_PREFIX.length);
    if (!isImageFileName(name)) continue;
    images[name] = data;
  }

  let manifest: unknown = null;
  const manifestBytes = files[MANIFEST_JSON];
  if (manifestBytes) {
    try {
      manifest = JSON.parse(strFromU8(manifestBytes));
    } catch {
      manifest = null; // 清单坏了不影响数据 —— 它只是给人看的
    }
  }

  return { ok: true, payload: parsed.payload, images, manifest };
};
