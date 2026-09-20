/**
 * 内容哈希 —— 判断「这条记录变了没有」的唯一依据。
 *
 * **前后端共用同一份代码**：服务端在写盘成功后算一次（算的是**真正落到磁盘的那份**），
 * 客户端把它存为基线；客户端自己要判断「本地是否变了」时再算一次，两者不等就是脏。
 * 两边必须是同一个算法、同一个序列化 —— 差一个字节就会永远判脏、永远在同步。
 *
 * 为什么不能直接 `JSON.stringify` 再哈希：对象键序取决于插入顺序，而**用户手改文件**
 * 会改变键序（重排、重新格式化）。那会让同一条内容算出两个哈希 → 假冲突。
 * 所以先按键排序。
 *
 * 为什么用 `crypto.subtle` 而不引一个哈希库：Node 20+ 与所有现代浏览器都自带
 * `globalThis.crypto.subtle`，零依赖且两边天然同构。代价是它只有异步接口
 * （浏览器端不提供同步版本），所以这里也是异步的。
 */

/** 取哈希前多少位 hex。128 位——比 64 位宽得多，且比完整 SHA-256 短一半 */
export const HASH_HEX_LENGTH = 32;

/**
 * `toJSON` 优先，与 `JSON.stringify` 的行为对齐。
 *
 * 少了这一步，`Date` 之类的对象会被当成「没有可枚举属性的普通对象」序列化成 `{}`，
 * 与 `JSON.stringify` 给出的结果不一致 —— 而调用方无从知道自己踩了这个坑。
 */
const hasToJSON = (value: object): value is { toJSON: () => unknown } =>
  typeof (value as { toJSON?: unknown }).toJSON === "function";

/**
 * 递归按键排序后序列化。**确定性的**：同一个值永远给出同一个字符串。
 *
 * 与 `JSON.stringify` 的语义对齐的地方：对象里值为 `undefined` 的键整个丢掉、
 * 数组里的 `undefined` 变成 `null`、`NaN` / `Infinity` 变成 `null`。
 */
export const stableStringify = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    // 空数组是 []。这里刻意不走下面的对象分支 —— 数组的键序有意义，不能排序
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    if (hasToJSON(value)) return stableStringify(value.toJSON());
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      // 显式比较而不是 `a.localeCompare(b)`：后者受语言环境影响，不同机器可能给出
      // 不同顺序 —— 那就不是「确定的」了
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  // 函数 / symbol / undefined / 非有限数字：JSON.stringify 都给出 undefined，
  // 统一成 "null"（数组元素的位置必须保住）
  return JSON.stringify(value) ?? "null";
};

/** 内容哈希：`stableStringify` 之后取 SHA-256 的前 `HASH_HEX_LENGTH` 位 hex */
export const contentHash = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_HEX_LENGTH);
};
