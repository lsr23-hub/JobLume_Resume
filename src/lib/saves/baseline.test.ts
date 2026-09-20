import { describe, expect, it } from "vitest";
import {
  SAVES_SCHEMA_VERSION,
  emptyBaseline,
  parseBaseline,
  parseRecordKey,
  recordKey,
} from "./baseline";

describe("基线的键规则（前后端共用）", () => {
  it("profile 不带 id，其余带 kind 前缀", () => {
    expect(recordKey("profile")).toBe("profile");
    expect(recordKey("resume", "r1")).toBe("resume:r1");
    expect(recordKey("jd", "t1")).toBe("jd:t1");
  });

  it("键能原样解析回去", () => {
    for (const [kind, id] of [
      ["profile", undefined],
      ["resume", "r1"],
      ["jd", "t1"],
    ] as const) {
      expect(parseRecordKey(recordKey(kind, id))).toEqual({ kind, id });
    }
  });

  it("**认不出的键返回 null**，而不是硬拆 —— 基线可以被手改", () => {
    for (const bad of [
      "",
      "resume",          // 没有冒号
      "resume:",         // id 是空的
      ":r1",             // kind 是空的
      "profile:r1",      // profile 不接 id
      "nonsense:1",      // 不认识的 kind
      "resume:a:b",      // 多余的分隔符：id 会是 "a:b"，正则上合法但 kind 认得，见下
    ]) {
      const parsed = parseRecordKey(bad);
      if (bad === "resume:a:b") {
        // 这条刻意留着：id 里带冒号是合法的（服务端只校验 id 的字符集，
        // 而 uuid 里没有冒号）—— 只要能原样取回来就不算错
        expect(parsed).toEqual({ kind: "resume", id: "a:b" });
      } else {
        expect(parsed).toBeNull();
      }
    }
  });
});

describe("解析服务端回传的基线", () => {
  it("正常形状：版本与记录都留下", () => {
    expect(parseBaseline({ schemaVersion: 2, records: { profile: "abc" } })).toEqual({
      schemaVersion: 2,
      records: { profile: "abc" },
    });
  });

  it("**非字符串的值丢掉**，不是整个基线作废", () => {
    expect(
      parseBaseline({ schemaVersion: 2, records: { profile: "abc", bad: 42, worse: null } })
    ).toEqual({ schemaVersion: 2, records: { profile: "abc" } });
  });

  it("认不出的输入 → 空基线（丢掉一条的后果只是多存一次，不丢数据）", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { records: [] }]) {
      expect(parseBaseline(bad)).toEqual(emptyBaseline());
    }
  });

  it("缺 schemaVersion → 用当前版本补上，记录照留", () => {
    expect(parseBaseline({ records: { profile: "abc" } })).toEqual({
      schemaVersion: SAVES_SCHEMA_VERSION,
      records: { profile: "abc" },
    });
  });
});
