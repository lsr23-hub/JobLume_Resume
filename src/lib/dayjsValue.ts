import dayjs, { type Dayjs } from "dayjs";

/**
 * antd DatePicker 的取值适配层。
 *
 * 数据层（职业数据库、简历）存的是字符串，antd 要的是 dayjs 对象，
 * 两者在这里互转。
 *
 * 解析一律「取前几个数字」而不是按格式解析：历史数据里同时存在
 * `2021.07`、`2021/07`、`2021年7月` 三种写法，用 dayjs 的格式解析
 * 还得引入 customParseFormat 插件，按数字取更省事也更宽容。
 */

/** 「至今」的各种写法，与 `lib/profile/entityUtils` 的 PRESENT_SUFFIX 一致 */
const PRESENT_RE = /至今|现在|目前|to\s+present|present|now|current/i;

export const isPresent = (value: string): boolean => PRESENT_RE.test(value ?? "");

/**
 * 取出值里「至今」的原文。
 *
 * 不能自己拼一个 —— 英文界面写的是 `To Present`，照着原样回写才不会
 * 把用户数据改成另一种写法。
 */
export const presentToken = (value: string): string | null =>
  (value ?? "").match(PRESENT_RE)?.[0] ?? null;

/** 数据层用「/」，数据库里存的是「.」；两种都要能读 */
export const DAY_FORMAT = "YYYY/MM/DD";
export const MONTH_FORMAT = "YYYY/MM";
export const DOTTED_MONTH_FORMAT = "YYYY.MM";

/**
 * 把字符串解析成 dayjs。
 *
 * `granularity` 决定精度：`month` 归一到当月 1 号，`day` 保留到日
 * （日缺失时补 1，超出当月天数时夹到月末）。
 */
export const parseDayjs = (
  value: string,
  granularity: "month" | "day" = "day"
): Dayjs | null => {
  const nums = (value ?? "").match(/\d+/g);
  if (!nums || nums.length === 0) return null;

  const [year, month = 1, day = 1] = nums.map(Number);
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;

  if (granularity === "month") return dayjs(new Date(year, month - 1, 1));

  const lastDay = new Date(year, month, 0).getDate();
  return dayjs(new Date(year, month - 1, Math.min(Math.max(day, 1), lastDay)));
};
