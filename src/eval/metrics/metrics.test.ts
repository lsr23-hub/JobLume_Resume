import { describe, expect, it } from "vitest";
import type { MatchAnalysis } from "@/types/jobTarget";
import type { ProfileEntity } from "@/types/profile";
import { computeCoverageMetrics } from "./coverage";
import { computeRequirementMetrics } from "./requirements";
import { computeJudgmentMetrics } from "./judgment";
import { computeRankingMetrics } from "./ranking";
import { computeSelectionMetrics } from "./selection";
import { judgmentDiff, kendallTau } from "./stability";
import type { GoldEntity, GoldRequirement } from "../types";

/**
 * 指标函数的单测。
 *
 * 这些是纯函数 —— 指标算错的话，报告再漂亮也是假的，而它看起来会很权威。
 * 每个指标都用手算得出的例子钉住。
 */

const entity = (id: string, over: Partial<ProfileEntity> = {}): ProfileEntity => ({
  id,
  type: "custom",
  sectionId: "experience",
  title: id,
  subtitle: "",
  dateRange: "",
  description: "",
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const analysis = (over: Partial<MatchAnalysis> = {}): MatchAnalysis => ({
  items: {},
  rankedIds: [],
  topN: 5,
  summary: {
    recommendedCount: 0,
    coverage: { covered: [], weak: [], missing: [] },
    advice: "",
  },
  modelId: "test",
  promptVersion: "test",
  analyzedAt: "",
  ...over,
});

const goldOf = (entries: Record<string, Partial<GoldEntity>>): Record<string, GoldEntity> =>
  Object.fromEntries(
    Object.entries(entries).map(([id, g]) => [
      id,
      { relevance: 0, level: "not_recommended", ...g } as GoldEntity,
    ])
  );

describe("computeJudgmentMetrics", () => {
  const entities = [entity("a"), entity("b"), entity("c"), entity("d")];
  const gold = goldOf({
    a: { level: "recommended" },
    b: { level: "recommended" },
    c: { level: "not_recommended" },
    d: { level: "not_recommended" },
  });

  it("漏判与误判分开计数", () => {
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          a: { level: "recommended", reason: "", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
          b: { level: "not_recommended", reason: "无关", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
          c: { level: "recommended", reason: "", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
          d: { level: "not_recommended", reason: "无关", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      gold,
      entities
    );

    expect(m.truePositive).toBe(1); // a
    expect(m.falseNegative).toBe(1); // b —— 人工推荐、AI 否掉
    expect(m.falsePositive).toBe(1); // c
    expect(m.trueNegative).toBe(1); // d
    expect(m.falseNegativeRate).toBeCloseTo(0.5);
    expect(m.falsePositiveRate).toBeCloseTo(0.5);
  });

  it("模型没给判定的条目按不推荐计 —— 沉默不等于推荐", () => {
    const m = computeJudgmentMetrics(analysis(), gold, entities);
    expect(m.falseNegative).toBe(2);
    expect(m.falsePositive).toBe(0);
  });

  it("证据自洽率 = 1 − 自动提升数 / 不推荐数", () => {
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          c: { level: "recommended", reason: "", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [], autoPromoted: true },
          d: { level: "not_recommended", reason: "无关", evidence: "原文", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      gold,
      entities
    );
    // 不推荐判定 2 条（c 被提升后算推荐，d 是唯一剩下的不推荐）… c 提升前是不推荐，计入分母
    expect(m.autoPromotedCount).toBe(1);
    expect(m.evidenceSelfConsistency).toBeCloseTo(1 - 1 / m.notRecommendedCount);
  });

  it("理由里编造的技术名词会被抓出来", () => {
    const withDesc = [
      entity("a", { description: "<p>用 Python 做因子挖掘</p>" }),
      entity("b", { description: "" }),
    ];
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          a: { level: "recommended", reason: "使用 DolphinDB 搭建回测", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      goldOf({ a: { level: "recommended" }, b: { level: "recommended" } }),
      withDesc
    );
    expect(m.hallucinations.map((h) => h.token)).toEqual(["DolphinDB"]);
    expect(m.hallucinations[0].title).toBe("a");
  });

  it("原文里有的词不算幻觉", () => {
    const withDesc = [entity("a", { description: "<p>用 Python 与 DolphinDB 做因子挖掘</p>" })];
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          a: { level: "recommended", reason: "用 Python 和 DolphinDB", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      goldOf({ a: { level: "recommended" } }),
      withDesc
    );
    expect(m.hallucinations).toEqual([]);
  });
});

describe("computeRankingMetrics", () => {
  it("完美排序得满分", () => {
    const gold = goldOf({
      a: { relevance: 3, level: "recommended" },
      b: { relevance: 2, level: "recommended" },
      c: { relevance: 1, level: "recommended" },
    });
    const m = computeRankingMetrics(analysis({ rankedIds: ["a", "b", "c"] }), gold);
    expect(m.ndcgAt5).toBeCloseTo(1);
    expect(m.top5HitRate).toBe(1);
    expect(m.spearman).toBeCloseTo(1);
  });

  it("顺序颠倒会掉分", () => {
    const gold = goldOf({
      a: { relevance: 3, level: "recommended" },
      b: { relevance: 2, level: "recommended" },
      c: { relevance: 1, level: "recommended" },
    });
    const m = computeRankingMetrics(analysis({ rankedIds: ["c", "b", "a"] }), gold);
    expect(m.ndcgAt5).toBeLessThan(1);
    expect(m.spearman).toBeCloseTo(-1);
  });

  it("全部同分时相关性无定义，按不矛盾记 1", () => {
    const gold = goldOf({ a: { relevance: 2 }, b: { relevance: 2 } });
    expect(computeRankingMetrics(analysis({ rankedIds: ["b", "a"] }), gold).spearman).toBe(1);
  });

  it("标注之外的 id 不参与计算", () => {
    const gold = goldOf({ a: { relevance: 3, level: "recommended" } });
    const m = computeRankingMetrics(analysis({ rankedIds: ["zzz", "a"] }), gold);
    expect(m.aiTop5).toEqual(["a"]);
  });
});

describe("computeSelectionMetrics", () => {
  const gold = goldOf({
    a: { relevance: 3, level: "recommended", mustHave: true },
    b: { relevance: 3, level: "recommended" },
    c: { relevance: 1, level: "not_recommended" },
    d: { relevance: 3, level: "recommended" },
  });

  it("预算等于理想集合大小，取 AI 排序的前 K 条", () => {
    const m = computeSelectionMetrics(analysis({ rankedIds: ["d", "a", "b", "c"] }), gold, ["a", "b"]);
    expect(m.budget).toBe(2);
    expect(m.mustHaveRecall).toBe(1); // a 在里面
    expect(m.idealJaccard).toBeCloseTo(1 / 3); // {d,a} vs {a,b}
  });

  it("关键经历没进简历时召回率直接掉下来", () => {
    const m = computeSelectionMetrics(analysis({ rankedIds: ["b", "c"] }), gold, ["a", "b"]);
    expect(m.mustHaveRecall).toBe(0);
    expect(m.missed.map((x) => x.id)).toContain("a");
  });

  it("选择质量 = 实选相关度之和 / 最优 K 条之和", () => {
    // 最优两条是 a+b = 6；选了 d+c = 4
    const m = computeSelectionMetrics(analysis({ rankedIds: ["d", "c"] }), gold, ["a", "b"]);
    expect(m.selectionQuality).toBeCloseTo(4 / 6);
  });
});

describe("computeCoverageMetrics", () => {
  it("缺失项召回按双向包含匹配，措辞不同也算找到", () => {
    const m = computeCoverageMetrics(
      analysis({ summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: ["Spark / Flink"] }, advice: "" } }),
      ["Flink", "Java"]
    );
    expect(m.missingFound).toEqual(["Flink"]);
    expect(m.missingMissed).toEqual(["Java"]);
    expect(m.missingRecall).toBeCloseTo(0.5);
  });

  it("人工点名不该出现的技能进了 covered 就算虚报", () => {
    const m = computeCoverageMetrics(
      analysis({ summary: { recommendedCount: 0, coverage: { covered: ["Python", "驾照"], weak: [], missing: [] }, advice: "" } }),
      [],
      ["驾照"]
    );
    expect(m.coverageFalsePositive).toBe(1);
    expect(m.unsupportedClaimed).toEqual(["驾照"]);
  });

  it("没有标注缺失项时不扣分", () => {
    expect(computeCoverageMetrics(analysis(), []).missingRecall).toBe(1);
  });
});

describe("稳定性", () => {
  it("judgmentDiff 只比二值结论，不比理由措辞", () => {
    const a = analysis({ items: { x: { level: "recommended", reason: "甲", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] } } });
    const b = analysis({ items: { x: { level: "recommended", reason: "乙", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] } } });
    expect(judgmentDiff(a, b)).toEqual([]);
  });

  it("肯德尔 τ：完全一致为 1，完全相反为 -1", () => {
    expect(kendallTau(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    expect(kendallTau(["a", "b", "c"], ["c", "b", "a"])).toBe(-1);
  });
});

describe("幻觉检测要连 JD 一起查", () => {
  const entities = [entity("a", { title: "字节跳动", description: "<p>做前端性能优化</p>" })];

  it("理由里引用 JD 的术语不算编造", () => {
    // 新 prompt 要求「reason 点出对应 JD 的哪一条要求」，于是理由里会合法地
    // 出现 JD 的术语。只查条目原文的话这些全成幻觉 —— 实测 8 条误报里 5 条如此
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          a: { level: "recommended", reason: "对应 JD 的 P99 延迟要求", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      goldOf({ a: { level: "recommended" } }),
      entities,
      "岗位职责：保障接口 P99 延迟达标"
    );
    expect(m.hallucinations).toEqual([]);
  });

  it("两边都没有的术语仍判为编造", () => {
    const m = computeJudgmentMetrics(
      analysis({
        items: {
          a: { level: "recommended", reason: "熟悉 Kubernetes 编排", evidence: "", inTopN: false, matchedSkills: [], requirementIds: [], missingSkills: [] },
        },
      }),
      goldOf({ a: { level: "recommended" } }),
      entities,
      "岗位职责：保障接口 P99 延迟达标"
    );
    expect(m.hallucinations.map((h) => h.token)).toEqual(["Kubernetes"]);
  });
});

describe("缺失项匹配：同一件事不同措辞", () => {
  it("复合长句与原子术语算匹配", () => {
    // 人工标注爱写长句，模型给原子术语 —— 逐字比对会把正确回答判成漏掉
    const m = computeCoverageMetrics(
      analysis({ summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: ["图表库实战", "开源贡献"] }, advice: "" } }),
      ["复杂数据可视化经验（Canvas/WebGL/图表库）"]
    );
    expect(m.missingRecall).toBe(1);
  });

  it("JD 的干扰项不能算作找到了缺口", () => {
    // fin-04 实测：模型把「党员/驾照/篮球」当成档案缺失的技能。
    // 匹配放宽不等于放这么宽
    const m = computeCoverageMetrics(
      analysis({ summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: ["中共党员", "驾照"] }, advice: "" } }),
      ["实时流计算（Flink/Spark Streaming）"]
    );
    expect(m.missingRecall).toBe(0);
  });
});

describe("computeRequirementMetrics —— 要求项召回", () => {
  const goldReqs: GoldRequirement[] = [
    { text: "精通 React 与 TypeScript", kind: "must" },
    { text: "5 年以上前端经验", kind: "must" },
    { text: "有开源项目贡献", kind: "nice" },
    { text: "负责组件库建设", kind: "duty" },
  ];

  const withReqs = (requirements: unknown[]) =>
    analysis({ summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: [] }, advice: "" },
               requirements } as never);

  it("全部抽出时召回为 1", () => {
    const m = computeRequirementMetrics(
      withReqs([
        { id: "r1", text: "精通 React 与 TypeScript，有大型 SPA 架构经验", keys: ["React"], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
        { id: "r2", text: "5 年以上前端开发经验", keys: ["前端经验"], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
        { id: "r3", text: "有开源项目贡献经历", keys: ["开源贡献"], kind: "nice", status: "missing", entityIds: [], sourceQuote: "" },
      ]),
      goldReqs
    );
    expect(m.requirementRecall).toBe(1);
    expect(m.mustRecall).toBe(1);
    expect(m.missed).toEqual([]);
  });

  it("漏掉一条硬性要求会被单独列出来 —— 那是最该看见的失败", () => {
    const m = computeRequirementMetrics(
      withReqs([
        { id: "r1", text: "精通 React 与 TypeScript", keys: [], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
      ]),
      goldReqs
    );
    // 任职要求 3 条（must 2 + nice 1），抽中 1 条
    expect(m.requirementRecall).toBeCloseTo(1 / 3);
    expect(m.mustMissed).toEqual(["5 年以上前端经验"]);
    expect(m.mustRecall).toBeCloseTo(0.5);
  });

  it("职责不计入召回 —— 金标准里那份是概括，粒度比任职要求粗", () => {
    const m = computeRequirementMetrics(withReqs([]), [
      { text: "负责组件库建设", kind: "duty" },
    ]);
    // 只有职责时无可评项，按满分处理而不是 0
    expect(m.requirementRecall).toBe(1);
    expect(m.extracted).toBe(0);
  });

  it("措辞不同但指向同一条要求时算抽中 —— 复用缺失项召回那套匹配器", () => {
    const m = computeRequirementMetrics(
      withReqs([
        { id: "r1", text: "五年以上前端开发经验", keys: [], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
      ]),
      [{ text: "5 年以上前端经验", kind: "must" }]
    );
    expect(m.requirementRecall).toBe(1);
  });

  it("用 keys 命中也算 —— 模型可能把原子词与正文分开写", () => {
    const m = computeRequirementMetrics(
      withReqs([
        { id: "r1", text: "工程化与基建能力要求", keys: ["组件库建设经验"], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
      ]),
      [{ text: "组件库建设经验", kind: "must" }]
    );
    expect(m.requirementRecall).toBe(1);
  });

  it("没有分析结果时召回为 0，且不抛异常", () => {
    const m = computeRequirementMetrics(null, goldReqs);
    expect(m.extracted).toBe(0);
    expect(m.requirementRecall).toBe(0);
    expect(m.mustRecall).toBe(0);
  });

  it("金标准没有可评项时按满分处理（除零不该算作失败）", () => {
    const m = computeRequirementMetrics(withReqs([]), []);
    expect(m.requirementRecall).toBe(1);
    expect(m.mustRecall).toBe(1);
  });

  it("extracted 报出模型抽了多少条 —— 用来发现「只抽两条就交差」", () => {
    const m = computeRequirementMetrics(
      withReqs([
        { id: "r1", text: "A", keys: [], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
        { id: "r2", text: "B", keys: [], kind: "must", status: "covered", entityIds: [], sourceQuote: "" },
      ]),
      goldReqs
    );
    expect(m.extracted).toBe(2);
  });
});
