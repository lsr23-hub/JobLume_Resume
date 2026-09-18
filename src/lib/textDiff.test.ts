import { describe, expect, it } from "vitest";
import { diffSegments, summarizeDiff, tokenize } from "./textDiff";

const added = (segments: ReturnType<typeof diffSegments>): string =>
  segments.filter((s) => s.op === "add").map((s) => s.text).join("");
const removed = (segments: ReturnType<typeof diffSegments>): string =>
  segments.filter((s) => s.op === "del").map((s) => s.text).join("");

describe("tokenize", () => {
  it("中文按单字切 —— 中文没有词边界，按字切不会切错词", () => {
    expect(tokenize("重构订单")).toEqual(["重", "构", "订", "单"]);
  });

  it("拉丁与数字按词切", () => {
    expect(tokenize("React 18 + TS")).toEqual(["React", " ", "18", " ", "+", " ", "TS"]);
  });

  it("空串得到空数组", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("diffSegments", () => {
  it("完全相同：没有增删", () => {
    const s = diffSegments("负责订单系统重构", "负责订单系统重构");
    expect(summarizeDiff(s)).toEqual({ added: 0, removed: 0, addedChars: 0 });
  });

  it("纯新增能完整还原出新增内容", () => {
    const s = diffSegments("参与用户增长相关工作", "参与用户增长项目，推动用户规模提升");
    expect(added(s)).toBe("项目，推动用户规模提升");
  });

  it("纯删除能完整还原出被删内容", () => {
    const s = diffSegments("负责订单系统重构工作", "负责订单系统重构");
    expect(removed(s)).toBe("工作");
  });

  it("改写：被换掉的词算删+增", () => {
    // LCS 长度相同时切分点有多个解（这里是「参与」整体换「主导」，也可能切成
    // 逐字替换），所以断言语义而不是某一种切法
    const s = diffSegments("参与订单系统开发", "主导订单系统开发");
    expect(added(s)).toContain("主导");
    expect(removed(s)).toContain("参与");
    expect(s.filter((x) => x.op === "same").map((x) => x.text).join("")).toBe("订单系统开发");
  });

  it("拼接后能还原出原文与改后文 —— 不能丢字", () => {
    const before = "- 负责**订单系统**重构，响应时间从 800ms 降到 200ms";
    const after = "- 主导**订单系统**重构，响应时间由 800ms 优化至 200ms";
    const s = diffSegments(before, after);
    const rebuiltBefore = s.filter((x) => x.op !== "add").map((x) => x.text).join("");
    const rebuiltAfter = s.filter((x) => x.op !== "del").map((x) => x.text).join("");
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });

  it("一边为空时整体算增/删", () => {
    expect(added(diffSegments("", "全新内容"))).toBe("全新内容");
    expect(removed(diffSegments("旧内容", ""))).toBe("旧内容");
    expect(diffSegments("", "")).toEqual([]);
  });

  it("相邻同类片段会合并 —— 渲染时不该出现一堆碎 span", () => {
    const s = diffSegments("ABC", "AXC");
    const ops = s.map((x) => x.op);
    for (let i = 1; i < ops.length; i += 1) expect(ops[i]).not.toBe(ops[i - 1]);
  });
});

describe("summarizeDiff", () => {
  it("新增计数不把空白算进去", () => {
    // 两处新增被共同的「开发」隔开，算两段 —— 合并只发生在相邻同类片段之间
    const s = diffSegments("负责开发", "负责 开发 工作");
    expect(summarizeDiff(s)).toEqual({ added: 2, removed: 0, addedChars: 2 });
  });

  it("没有改动时全为 0", () => {
    expect(summarizeDiff(diffSegments("一样", "一样"))).toEqual({
      added: 0,
      removed: 0,
      addedChars: 0,
    });
  });
});
