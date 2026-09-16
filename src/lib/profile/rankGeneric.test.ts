import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import { rankGeneric, recencyScore, RECENCY_CURVE } from "./rankGeneric";

const NOW = Date.UTC(2026, 0, 1);
const YEARS_AGO = (n: number) => NOW - n * 365.25 * 24 * 3600 * 1000;

const entity = (
  id: string,
  opts: { tags?: string[]; yearsAgo?: number; isCurrent?: boolean; hidden?: boolean } = {}
): ProfileEntity => ({
  id,
  type: "experience",
  sectionId: "experience",
  title: id,
  subtitle: "",
  dateRange: "",
  description: "",
  tags: opts.tags ?? [],
  skills: [],
  metrics: [],
  order: 0,
  hidden: opts.hidden,
  isCurrent: opts.isCurrent,
  endTimestamp: opts.isCurrent ? undefined : YEARS_AGO(opts.yearsAgo ?? 0),
  createdAt: "",
  updatedAt: "",
});

const scoreOf = (result: ReturnType<typeof rankGeneric>, id: string) =>
  result.find((r) => r.entity.id === id)!.score;

describe("recencyScore", () => {
  it("进行中的条目永远满分", () => {
    expect(recencyScore(entity("a", { isCurrent: true }), NOW)).toBe(1);
  });

  it("3 年内满分", () => {
    expect(recencyScore(entity("a", { yearsAgo: 0 }), NOW)).toBe(1);
    expect(recencyScore(entity("a", { yearsAgo: 3 }), NOW)).toBe(1);
  });

  it("3-8 年线性衰减", () => {
    expect(recencyScore(entity("a", { yearsAgo: 5 }), NOW)).toBeCloseTo(0.68, 5);
    expect(recencyScore(entity("a", { yearsAgo: 5.5 }), NOW)).toBeCloseTo(0.6, 5);
  });

  it("8 年以上触底，且不再下降", () => {
    expect(recencyScore(entity("a", { yearsAgo: 8 }), NOW)).toBe(RECENCY_CURVE.floorScore);
    expect(recencyScore(entity("a", { yearsAgo: 20 }), NOW)).toBe(RECENCY_CURVE.floorScore);
  });

  it("无时间信息时返回中性分 0.5，而非 0", () => {
    const e = entity("a");
    e.endTimestamp = undefined;
    expect(recencyScore(e, NOW)).toBe(0.5);
  });
});

describe("rankGeneric — 同类衰减", () => {
  it("不同类型经历并列前排，同类后几条被压下", () => {
    const result = rankGeneric(
      [
        entity("finA", { tags: ["金融"] }),
        entity("cs", { tags: ["计算机"] }),
        entity("ops", { tags: ["运营"] }),
        entity("finB", { tags: ["金融"] }),
        entity("finC", { tags: ["金融"] }),
      ],
      NOW
    );

    expect(scoreOf(result, "finA")).toBeCloseTo(1);
    expect(scoreOf(result, "cs")).toBeCloseTo(1);
    expect(scoreOf(result, "ops")).toBeCloseTo(1);
    expect(scoreOf(result, "finB")).toBeCloseTo(0.5);
    expect(scoreOf(result, "finC")).toBeCloseTo(0.25);

    // 三类经历全部进入前三
    const top3 = result.slice(0, 3).map((r) => r.entity.id);
    expect(top3).toContain("finA");
    expect(top3).toContain("cs");
    expect(top3).toContain("ops");
  });

  it("类别足够新鲜时同类仍能排上去，不被无脑打压", () => {
    // 金融 B 是 1 年前（基础分 1.0），CS 是 5 年前（基础分 0.68）
    const result = rankGeneric(
      [
        entity("finA", { tags: ["金融"], yearsAgo: 1 }),
        entity("finB", { tags: ["金融"], yearsAgo: 1 }),
        entity("cs", { tags: ["计算机"], yearsAgo: 5 }),
      ],
      NOW
    );

    expect(scoreOf(result, "finB")).toBeCloseTo(0.5);
    expect(scoreOf(result, "cs")).toBeCloseTo(0.68);
    // CS 排在第二条金融经历之前
    expect(result.findIndex((r) => r.entity.id === "cs")).toBeLessThan(
      result.findIndex((r) => r.entity.id === "finB")
    );
  });

  it("未打标签的条目不参与衰减", () => {
    const result = rankGeneric(
      [entity("a"), entity("b"), entity("c")],
      NOW
    );
    expect(result.map((r) => r.score)).toEqual([1, 1, 1]);
    expect(result.every((r) => r.sameCategoryRank === 1)).toBe(true);
  });

  it("隐藏的条目不参与排序", () => {
    const result = rankGeneric(
      [entity("a"), entity("hidden", { hidden: true })],
      NOW
    );
    expect(result.map((r) => r.entity.id)).toEqual(["a"]);
  });
});

describe("rankGeneric — 确定性", () => {
  it("输入顺序打乱后结果完全一致", () => {
    const build = () => [
      entity("finA", { tags: ["金融"], yearsAgo: 1 }),
      entity("cs", { tags: ["计算机"], yearsAgo: 2 }),
      entity("ops", { tags: ["运营"], yearsAgo: 3 }),
      entity("finB", { tags: ["金融"], yearsAgo: 2 }),
      entity("finC", { tags: ["金融"], yearsAgo: 3 }),
    ];

    const a = rankGeneric(build(), NOW);
    const shuffled = build().reverse();
    const b = rankGeneric(shuffled, NOW);

    expect(b.map((r) => r.entity.id)).toEqual(a.map((r) => r.entity.id));
    expect(b.map((r) => r.score)).toEqual(a.map((r) => r.score));
  });

  it("重复调用 100 次结果完全相同", () => {
    const input = [
      entity("x", { tags: ["金融"], yearsAgo: 2 }),
      entity("y", { tags: ["金融"], yearsAgo: 2 }),
      entity("z", { tags: ["计算机"], yearsAgo: 2 }),
    ];
    const first = JSON.stringify(rankGeneric(input, NOW));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(rankGeneric(input, NOW))).toBe(first);
    }
  });
});
