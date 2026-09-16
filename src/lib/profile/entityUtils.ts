/**
 * `dateRange` 字符串的解析工具。
 *
 * 解析结果写入 `ProfileEntity.endTimestamp` / `isCurrent`，
 * 供排序使用 —— 避免在排序热路径上反复跑正则。
 */

export interface ParsedDateRange {
  /** 结束时间（毫秒时间戳）。无法解析时为空 */
  endTimestamp?: number;
  /**
   * 是否表示「仍在进行中」（如「至今」）。
   *
   * 单独存一个布尔值而不是把 endTimestamp 设为写入时刻 ——
   * 后者会让「至今」的经历随着时间推移被算成越来越旧。
   */
  isCurrent: boolean;
}

/**
 * 一个完整日期：`2021` / `2021.07` / `2021-07` / `2021/07/15` / `2021年7月`
 *
 * 用「提取全部日期再取首尾」而不是「按分隔符切分区间」—— 因为连字符
 * 既是日期分隔符又是区间分隔符，按分隔符切分会把 `2021-07 - 2024-12`
 * 切成五段。
 *
 * 两处细节：
 * - 尾部 `[月日号]?` 收下中文日期标记（`2013年9月` 的「月」不是分隔符）
 * - `(?!\d)` 断言避免跨过区间分隔符误吃字符，没有它时
 *   `2013.09 - 2017.06` 会匹配成 `2013.09 - 20`（把 2017 的前两位当成「日」）
 */
const DATE_TOKEN =
  /\d{4}(?:\s*[.\-/年]\s*\d{1,2}(?!\d))?(?:\s*[.\-/月]\s*\d{1,2}(?!\d))?[月日号]?/g;

/** 「至今」的各种写法。检查后缀 —— 它可能不带任何分隔符（如「2023.01至今」） */
const PRESENT_SUFFIX = /(?:至今|现在|目前|present|now|current)\s*$/i;

const extractDates = (text: string): string[] =>
  Array.from(text.matchAll(new RegExp(DATE_TOKEN.source, "g")), (m) => m[0].trim());

const parseOne = (text: string): { year: number; month?: number; day?: number } | null => {
  const m = text.match(/^(\d{4})(?:\s*[.\-/年]\s*(\d{1,2})(?!\d))?(?:\s*[.\-/月]\s*(\d{1,2})(?!\d))?/);
  if (!m) return null;

  const year = Number(m[1]);
  if (year < 1900 || year > 2200) return null;

  const month = m[2] ? Number(m[2]) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) return null;

  const day = m[3] ? Number(m[3]) : undefined;
  if (day !== undefined && (day < 1 || day > 31)) return null;

  return { year, month, day };
};

/** 用 UTC 构造时间戳，避免本地时区导致的跨日偏移 */
const toTimestamp = (
  d: { year: number; month?: number; day?: number },
  edge: "start" | "end"
): number => {
  const month = d.month ?? (edge === "start" ? 1 : 12);
  const day =
    d.day ?? (edge === "start" ? 1 : new Date(Date.UTC(d.year, month, 0)).getUTCDate());
  return Date.UTC(d.year, month - 1, day);
};

/**
 * 解析时间范围字符串。
 *
 * 支持的写法：
 * - `2021.07 - 2024.12` / `2021-07 - 2024-12` / `2021/07 - 2024/12`
 * - `2021年7月 - 2024年12月`
 * - `2021 - 2024`（仅年份，按该年 12 月 31 日处理结束）
 * - `2023.01 - 至今` / `2023.01至今` / `2023.01 - Present`
 * - `2021.07`（单点，按起始月处理）
 *
 * 无法解析时返回 `{ isCurrent: false }`，调用方按中性处理。
 */
export const parseDateRange = (dateRange: string | undefined): ParsedDateRange => {
  const trimmed = dateRange?.trim();
  if (!trimmed) return { isCurrent: false };

  // 必须先于日期提取处理：无分隔符的「2023.01至今」只有一个日期 token，
  // 若走单点分支会被当成起始月，丢失「进行中」语义
  if (PRESENT_SUFFIX.test(trimmed)) return { isCurrent: true };

  const dates = extractDates(trimmed);
  if (dates.length === 0) return { isCurrent: false };

  const target = dates.length === 1 ? dates[0] : dates[dates.length - 1];
  const parsed = parseOne(target);
  if (!parsed) return { isCurrent: false };

  return {
    endTimestamp: toTimestamp(parsed, dates.length === 1 ? "start" : "end"),
    isCurrent: false,
  };
};

/**
 * 把合并的时间范围拆成起止两段原始文本。
 *
 * 教育经历在简历层是 `startDate` / `endDate` 两个字段，其余板块是单个
 * `date` 字段，所以物化时需要拆分。原样保留文本（不规范化格式），
 * 由模板层的 `formatDateString` 负责本地化展示。
 */
export const splitDateRange = (dateRange: string | undefined): [string, string] => {
  const trimmed = dateRange?.trim();
  if (!trimmed) return ["", ""];

  const present = trimmed.match(PRESENT_SUFFIX);
  const dates = extractDates(trimmed);
  const start = dates[0] ?? "";

  if (present) return [start, present[0].trim()];
  if (dates.length <= 1) return [start, ""];

  return [start, dates[dates.length - 1]];
};
