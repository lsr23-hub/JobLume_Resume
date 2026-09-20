/**
 * 同步基线的**形状与键规则** —— 前后端共用。
 *
 * 单独成文件而不是留在 `lib/server/saves.ts` 里，理由与 `kinds.ts` 相同：那个模块
 * 引了 `node:fs`，客户端沾不得，而客户端现在就要读基线（判断「哪些改动还没落盘」）。
 *
 * 基线的权威副本在磁盘上（`saves/<userId>/.baseline.json`），由服务端在写盘成功后
 * 更新并回传。客户端**不自己造基线** —— 一旦两边各存一份，就会出现"哪份才算数"的
 * 问题，而那正是这套设计要避免的。
 */

/**
 * 存档 schema 版本。**不兼容的改动必须 +1。**
 *
 * 读侧遇到比本程序更高的版本会拒绝读写，而不是猜着读 —— 猜错的方向是静默丢数据。
 * 版本 1 是「没有基线文件」的时代。
 */
export const SAVES_SCHEMA_VERSION = 2;

export interface Baseline {
  schemaVersion: number;
  /** 键形如 `profile` / `resume:<id>` / `jd:<id>`，值是上次写盘时的内容哈希 */
  records: Record<string, string>;
}

export const emptyBaseline = (): Baseline => ({
  schemaVersion: SAVES_SCHEMA_VERSION,
  records: {},
});

/** 一条记录在基线里的键。profile 没有 id —— 一个用户只有一份 */
export const recordKey = (kind: string, id?: unknown): string =>
  kind === "profile" ? "profile" : `${kind}:${String(id)}`;

/**
 * `recordKey` 的逆运算。**认不出的键返回 null**，而不是硬拆 ——
 * 基线文件是可以被手改的，遇到不认识的键应当跳过它，而不是拼出一个假的路径。
 */
export const parseRecordKey = (
  key: string
): { kind: "profile" | "resume" | "jd"; id?: string } | null => {
  if (key === "profile") return { kind: "profile" };

  const at = key.indexOf(":");
  if (at <= 0) return null;

  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (kind !== "resume" && kind !== "jd") return null;
  if (!id) return null;
  return { kind, id };
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 宽松解析：只留下「字符串键 + 字符串值」的条目，认不出的整条丢掉。
 *
 * 客户端用它是为了拿基线做判断，不是做校验 —— 校验的权威在服务端
 * （`readBaseline` 会对着版本号拒绝）。这里丢掉一条的后果只是那条记录会被当成
 * 「与基线不一致」，也就是**多存一次**，不会丢数据。
 */
export const parseBaseline = (raw: unknown): Baseline => {
  if (!isRecord(raw) || !isRecord(raw.records)) return emptyBaseline();

  const records: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.records)) {
    if (typeof value === "string") records[key] = value;
  }
  return {
    schemaVersion:
      typeof raw.schemaVersion === "number" ? raw.schemaVersion : SAVES_SCHEMA_VERSION,
    records,
  };
};
