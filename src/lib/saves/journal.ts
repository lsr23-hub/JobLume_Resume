import type { MirrorOp } from "./mirror";

/**
 * **未落盘改动的日志。**
 *
 * 真相源是磁盘，所以「改了但还没写成功」这段窗口不能只存在内存里 —— 关标签页、
 * 崩、掉电都会把它抹掉。journal 就是这段窗口的持久化：入队时同步落进
 * localStorage，服务端 ack 之后摘掉，启动时重放。
 *
 * 它也是**唯一**还留在 localStorage 里的数据类内容 —— 稳态下它是空的。
 *
 * 为什么不能只靠「卸载时 flush 一次」：
 * - `sendBeacon` 发不了 DELETE，而新架构下未刷成功的 delete 会**永久丢失**
 *   （下次启动的基线来自磁盘，磁盘上那个文件还在，diff 便再也推不出 delete）
 * - 卸载回调不保证执行（崩溃、进程被杀、移动端直接冻结）
 */

export const JOURNAL_KEY_PREFIX = "joblume-pending:";

/**
 * 单条 journal 的体积上限。
 *
 * 超限就**不持久化**，而不是想办法截断 —— 一条 op 少了 payload 就不再是那条
 * 改动，截断出来的东西写回磁盘就是坏数据。不持久化的后果是「这段窗口没有兜底」，
 * 由调用方如实告诉用户，比悄悄写一份半成品安全。
 *
 * 512KB 的余量：一张照片内联进简历时 base64 约 100–200KB，够几条；而 localStorage
 * 总额度约 5MB，也不该被 journal 占满。
 */
export const MAX_JOURNAL_BYTES = 512 * 1024;

export type JournalWriteResult =
  | { persisted: true }
  | { persisted: false; reason: "too-large" | "quota" };

export const journalKey = (userId: string): string => `${JOURNAL_KEY_PREFIX}${userId}`;

// 用 Array.from 而不是展开运算符：tsconfig 的 target 是 ES5，展开一个 Iterable
// 过不了类型检查（本仓库已有同样的教训，见 rateLimit.ts 里那段 forEach 注释）
export const encodeJournal = (ops: Iterable<MirrorOp>): string => JSON.stringify(Array.from(ops));

/**
 * 读回 journal。**任何异常都返回空数组**，绝不抛 —— 启动路径上不该因为一条坏日志
 * 就把整个应用卡住。代价是坏日志会被静默丢弃，所以写入侧必须保证只写合法 JSON。
 */
export const decodeJournal = (text: string | null | undefined): MirrorOp[] => {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMirrorOp);
  } catch {
    return [];
  }
};

const isMirrorOp = (v: unknown): v is MirrorOp => {
  if (typeof v !== "object" || v === null) return false;
  const op = v as Record<string, unknown>;
  if (op.op === "delete") return typeof op.kind === "string";
  if (op.op === "write") return typeof op.kind === "string" && op.data !== undefined;
  return false;
};

const storage = (): Storage | null =>
  typeof window === "undefined" ? null : window.localStorage;

export const readJournal = (userId: string): MirrorOp[] => {
  try {
    return decodeJournal(storage()?.getItem(journalKey(userId)));
  } catch {
    return [];
  }
};

export const writeJournal = (
  userId: string,
  ops: Iterable<MirrorOp>
): JournalWriteResult => {
  const store = storage();
  if (!store) return { persisted: false, reason: "quota" };

  const text = encodeJournal(ops);
  if (text.length > MAX_JOURNAL_BYTES) return { persisted: false, reason: "too-large" };

  try {
    store.setItem(journalKey(userId), text);
    return { persisted: true };
  } catch {
    // 配额满了。降级为「这段窗口没有兜底」，由调用方如实提示
    return { persisted: false, reason: "quota" };
  }
};

export const clearJournal = (userId: string): void => {
  try {
    storage()?.removeItem(journalKey(userId));
  } catch {
    // 清不掉也不该让调用方炸：下一次写入会覆盖它
  }
};

/** 本机所有用户里还有未落盘改动的那些（供界面提示与调试点用） */
export const journalUserIds = (): string[] => {
  const store = storage();
  if (!store) return [];
  const ids: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(JOURNAL_KEY_PREFIX)) {
      ids.push(key.slice(JOURNAL_KEY_PREFIX.length));
    }
  }
  return ids.sort();
};
