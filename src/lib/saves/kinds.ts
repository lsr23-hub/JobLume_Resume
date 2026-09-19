/**
 * 存档的三种文件。
 *
 * 单独放一个文件，而不是留在 `lib/server/saves.ts` 里：**客户端也要用同一套
 * 字面量**（镜像模块要拼请求体、要按 kind 分派），而 `lib/server/saves.ts`
 * 引了 `node:fs`，客户端沾不得。
 */
export const SAVE_KINDS = ["profile", "resume", "jd"] as const;

export type SaveKind = (typeof SAVE_KINDS)[number];

export const isSaveKind = (value: unknown): value is SaveKind =>
  typeof value === "string" && (SAVE_KINDS as readonly string[]).includes(value);
