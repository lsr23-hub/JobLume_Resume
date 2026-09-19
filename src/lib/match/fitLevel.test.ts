import { describe, expect, it } from "vitest";
import type { MatchAnalysis, Requirement, RequirementKind, RequirementStatus } from "@/types/jobTarget";
import { fitLevelOf } from "./fitLevel";

const req = (
  id: string,
  kind: RequirementKind,
  status: RequirementStatus,
  entityIds: string[] = []
): Requirement => ({ id, text: id, keys: [id], kind, status, entityIds, sourceQuote: "" });

const analysis = (requirements?: Requirement[], over: Partial<MatchAnalysis> = {}): MatchAnalysis => ({
  items: {},
  rankedIds: [],
  topN: 5,
  requirements,
  summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: [] }, advice: "" },
  modelId: "test",
  promptVersion: "test",
  analyzedAt: "",
  ...over,
});

describe("fitLevelOf —— 等级由要求项推导", () => {
  it("没有分析 / 没有要求项 / 只有职责 → 无法判定，不给高分", () => {
    expect(fitLevelOf(null).level).toBe("unknown");
    expect(fitLevelOf(null).reason).toBe("no_analysis");
    expect(fitLevelOf(analysis([])).reason).toBe("no_requirements");
    // 只有 duty：硬性维度无从判定
    expect(fitLevelOf(analysis([req("d1", "duty", "missing")])).reason).toBe("no_requirements");
  });

  it("只要有一条硬性要求 missing 就是「差距较大」—— 哪怕其余全部覆盖", () => {
    const r = fitLevelOf(
      analysis([
        req("m1", "must", "covered", ["e1"]),
        req("m2", "must", "covered", ["e2"]),
        req("m3", "must", "missing"),
      ])
    );
    expect(r.level).toBe("gap");
    expect(r.reason).toBe("must_missing");
    expect(r.counts.mustMissing).toBe(1);
  });

  it("硬性要求支撑很薄（weak）→ 部分匹配，不读成「匹配度高」", () => {
    expect(fitLevelOf(analysis([req("m1", "must", "weak", ["e1"])])).level).toBe("partial");
    expect(fitLevelOf(analysis([req("m1", "must", "weak", ["e1"])])).reason).toBe("must_thin");
  });

  it("covered 但指不出经历 → 部分匹配（钉住 legacy 那条路径的过度声称）", () => {
    // 校验阶段会把新数据降级成 weak；但 legacyRequirements 反推出来的旧数据
    // 就是 covered + entityIds: []，不加 entityIds 判断它能一路够到 strong
    const r = fitLevelOf(analysis([req("m1", "must", "covered", [])]));
    expect(r.level).toBe("partial");
    expect(r.counts.mustBacked).toBe(0);
    expect(r.counts.mustThin).toBe(1);
  });

  it("硬性全有支撑、只是加分项缺 → 部分匹配", () => {
    const r = fitLevelOf(
      analysis([req("m1", "must", "covered", ["e1"]), req("n1", "nice", "missing")])
    );
    expect(r.level).toBe("partial");
    expect(r.reason).toBe("nice_missing");
  });

  it("硬性全有支撑、无缺失 → 匹配度高", () => {
    const r = fitLevelOf(
      analysis([
        req("m1", "must", "covered", ["e1"]),
        req("n1", "nice", "covered", ["e1"]),
        req("d1", "duty", "missing"), // 职责不参与
      ])
    );
    expect(r.level).toBe("strong");
    expect(r.reason).toBe("backed");
  });

  it("等级不读排序：recommendedCount 与 rankedIds 怎么变都不影响", () => {
    const reqs = [req("m1", "must", "covered", ["e1"])];
    const a = fitLevelOf(analysis(reqs, { summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: [] }, advice: "" } }));
    const b = fitLevelOf(analysis(reqs, { recommendedCount: 99 } as never));
    const c = fitLevelOf(analysis(reqs, { rankedIds: ["zzz"], topN: 0 }));
    expect(new Set([a.level, b.level, c.level]).size).toBe(1);
  });

  it("旧数据（没有 requirements 字段）：从 coverage 反推，且永远够不到 strong", () => {
    const withMissing = fitLevelOf(
      analysis(undefined, {
        summary: { recommendedCount: 0, coverage: { covered: ["A"], weak: [], missing: ["B"] }, advice: "" },
      })
    );
    expect(withMissing.level).toBe("gap");
    expect(withMissing.legacy).toBe(true);

    const allCovered = fitLevelOf(
      analysis(undefined, {
        summary: { recommendedCount: 0, coverage: { covered: ["A", "B"], weak: [], missing: [] }, advice: "" },
      })
    );
    // 反推出来的 covered 没有经历指向 → 最高只能到 partial
    expect(allCovered.level).toBe("partial");
    expect(allCovered.legacy).toBe(true);
  });

  it("单调性：把任一条要求的状态改好，等级不会变差", () => {
    const rank = { gap: 0, partial: 1, strong: 2, unknown: 3 } as const;
    const base: Array<[RequirementStatus, RequirementStatus]> = [
      ["missing", "weak"],
      ["missing", "covered"],
      ["weak", "covered"],
    ];
    for (const [from, to] of base) {
      const before = fitLevelOf(analysis([req("m1", "must", from, ["e1"])])).level;
      const after = fitLevelOf(analysis([req("m1", "must", to, ["e1"])])).level;
      expect(rank[after]).toBeGreaterThanOrEqual(rank[before]);
    }
  });
});
