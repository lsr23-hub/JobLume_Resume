import { describe, expect, it } from "vitest";
import { parseDateRange, splitDateRange } from "./entityUtils";

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe("parseDateRange", () => {
  it("解析完整区间，结束日期取该月最后一天", () => {
    expect(parseDateRange("2021.07 - 2024.12")).toEqual({
      endTimestamp: utc(2024, 12, 31),
      isCurrent: false,
    });
  });

  it("支持多种分隔符与写法", () => {
    const expected = { endTimestamp: utc(2024, 12, 31), isCurrent: false };
    for (const input of [
      "2021.07 - 2024.12",
      "2021-07 - 2024-12",
      "2021/07 - 2024/12",
      "2021年7月 - 2024年12月",
      "2021.07～2024.12",
    ]) {
      expect(parseDateRange(input), input).toEqual(expected);
    }
  });

  it("仅年份时按该年 12 月 31 日处理", () => {
    expect(parseDateRange("2021 - 2024")).toEqual({
      endTimestamp: utc(2024, 12, 31),
      isCurrent: false,
    });
  });

  it("正确识别闰年二月末", () => {
    expect(parseDateRange("2024.01 - 2024.02").endTimestamp).toBe(utc(2024, 2, 29));
    expect(parseDateRange("2023.01 - 2023.02").endTimestamp).toBe(utc(2023, 2, 28));
  });

  it("「至今」标记为进行中，且不设 endTimestamp", () => {
    for (const input of ["2023.01 - 至今", "2023.01 - Present", "2023.01 - 现在"]) {
      const result = parseDateRange(input);
      expect(result.isCurrent, input).toBe(true);
      expect(result.endTimestamp, input).toBeUndefined();
    }
  });

  it("单点日期按起始月处理", () => {
    expect(parseDateRange("2021.07")).toEqual({
      endTimestamp: utc(2021, 7, 1),
      isCurrent: false,
    });
  });

  it("空值与无法解析的输入返回中性结果，不抛异常", () => {
    for (const input of [undefined, "", "   ", "在职", "N/A", "abc-def"]) {
      const result = parseDateRange(input);
      expect(result.isCurrent, String(input)).toBe(false);
      expect(result.endTimestamp, String(input)).toBeUndefined();
    }
  });

  it("拒绝越界的年月", () => {
    // 起始越界但结束合法时，仍返回可用的结束时间
    expect(parseDateRange("2021.13 - 2022.01").endTimestamp).toBe(utc(2022, 1, 31));
    // 结束越界则整体无法解析
    expect(parseDateRange("2020.01 - 2021.13").endTimestamp).toBeUndefined();
    // 年份越界
    expect(parseDateRange("1800.01 - 1801.01").endTimestamp).toBeUndefined();
  });

  it("「至今」不被区间分隔符拆开", () => {
    // 回归：此前 `至` 会被当作区间分隔符，把「至今」切成「今」
    expect(parseDateRange("2023.01 - 至今").isCurrent).toBe(true);
    expect(parseDateRange("2023.01至今").isCurrent).toBe(true);
    expect(splitDateRange("2023.01 - 至今")).toEqual(["2023.01", "至今"]);
  });
});

describe("splitDateRange", () => {
  it("拆出起止两段原始文本", () => {
    expect(splitDateRange("2021.07 - 2024.12")).toEqual(["2021.07", "2024.12"]);
    expect(splitDateRange("2013年9月 - 2017年6月")).toEqual(["2013年9月", "2017年6月"]);
  });

  it("单点日期返回空结束值", () => {
    expect(splitDateRange("2021.07")).toEqual(["2021.07", ""]);
  });

  it("空值返回两个空串", () => {
    expect(splitDateRange(undefined)).toEqual(["", ""]);
    expect(splitDateRange("")).toEqual(["", ""]);
  });
});
