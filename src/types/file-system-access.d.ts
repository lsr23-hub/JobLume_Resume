/**
 * File System Access API 里「权限」相关的那部分补充声明。
 *
 * TypeScript 的 `lib.dom` 至今没有 `queryPermission` / `requestPermission` /
 * `FileSystemPermissionMode` —— 但它们在 Chromium 里是真实存在的 API，
 * `src/utils/fileSystem.ts` 一直在用。不补这三条，那三处调用过不了类型检查。
 *
 * 本文件**没有 import/export**，因此是全局脚本，声明直接生效。
 */

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandle {
  queryPermission(descriptor?: {
    mode?: FileSystemPermissionMode;
  }): Promise<PermissionState>;
  requestPermission(descriptor?: {
    mode?: FileSystemPermissionMode;
  }): Promise<PermissionState>;
}
