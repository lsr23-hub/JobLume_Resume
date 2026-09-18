import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import { parseMatchPayload, validateMatchResult } from "./validateMatchResult";

const entity = (id: string, over: Partial<ProfileEntity> = {}): ProfileEntity => ({
  id,
  type: "experience",
  sectionId: "experience",
  title: id,
  subtitle: "",
  dateRange: "",
  description: `<ul><li>${id} 主导了性能优化</li></ul>`,
  tags: [],
  skills: ["React"],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const opts = {
  modelId: "deepseek-chat",
  promptVersion: "v1",
  analyzedAt: "2026-01-01T00:00:00.000Z",
};

describe("validateMatchResult — 基本校验", () => {
  it("合法输入原样通过", () => {
    const { analysis, corrections } = validateMatchResult(
      {
        items: [
          { id: "a", level: "recommended", reason: "相关", matchedSkills: ["React"] },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(corrections).toEqual([]);
    expect(analysis.items.a.level).toBe("recommended");
    expect(analysis.items.a.matchedSkills).toEqual(["React"]);
  });

  it("未知 id 被丢弃并记录", () => {
    const { analysis, corrections } = validateMatchResult(
      { items: [{ id: "ghost", level: "recommended" }] },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.ghost).toBeUndefined();
    expect(corrections[0].type).toBe("unknown_id");
  });

  it("重复 id 保留第一条", () => {
    const { analysis, corrections } = validateMatchResult(
      {
        items: [
          { id: "a", level: "not_recommended", evidence: "a 主导了性能优化" },
          { id: "a", level: "recommended" },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.level).toBe("not_recommended");
    expect(corrections.some((c) => c.type === "duplicate")).toBe(true);
  });

  it("非法 level 按推荐处理", () => {
    const { analysis, corrections } = validateMatchResult(
      { items: [{ id: "a", level: "strong" }] },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.level).toBe("recommended");
    expect(corrections.some((c) => c.type === "invalid_level")).toBe(true);
  });
});

describe("validateMatchResult — 证据自洽（核心约束）", () => {
  it("否定依据能在原文找到时，保持不推荐", () => {
    const { analysis, corrections } = validateMatchResult(
      {
        items: [
          { id: "a", level: "not_recommended", evidence: "a 主导了性能优化" },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.level).toBe("not_recommended");
    expect(corrections).toEqual([]);
  });

  it("依据为空时提升为推荐", () => {
    const { analysis, corrections } = validateMatchResult(
      { items: [{ id: "a", level: "not_recommended", evidence: "" }] },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.level).toBe("recommended");
    expect(corrections.some((c) => c.type === "evidence_not_found")).toBe(true);
  });

  it("依据是编造时提升为推荐 —— 无法举证就不该否定", () => {
    const { analysis, corrections } = validateMatchResult(
      {
        items: [
          { id: "a", level: "not_recommended", evidence: "该候选人不具备团队管理经验" },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.level).toBe("recommended");
    expect(corrections.some((c) => c.type === "evidence_not_found")).toBe(true);
  });

  it("忽略空白差异但仍要求字面一致", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "not_recommended", evidence: "a  主导了  性能优化" }] },
      { entities: [entity("a")], ...opts }
    );
    expect(analysis.items.a.level).toBe("not_recommended");
  });

  it("依据来自副标题时同样算有效（模型看到的就是这些字段）", () => {
    const e = entity("a", { subtitle: "JLPT N3 · 日常交流", description: "" });
    const { analysis, corrections } = validateMatchResult(
      { items: [{ id: "a", level: "not_recommended", evidence: "日常交流" }] },
      { entities: [e], ...opts }
    );

    expect(analysis.items.a.level).toBe("not_recommended");
    expect(corrections).toEqual([]);
  });

  it("证据来自技能/成果字段时也算有效", () => {
    const e = entity("a", { description: "", skills: [], metrics: ["构建时间 8min→2min"] });
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "not_recommended", evidence: "构建时间 8min→2min" }] },
      { entities: [e], ...opts }
    );
    expect(analysis.items.a.level).toBe("not_recommended");
  });

  it("提升为推荐时清空理由并打标记 —— 避免界面自相矛盾", () => {
    const { analysis } = validateMatchResult(
      {
        items: [
          {
            id: "a",
            level: "not_recommended",
            reason: "与岗位要求无关",
            evidence: "编造的依据",
          },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    const item = analysis.items.a;
    expect(item.level).toBe("recommended");
    expect(item.autoPromoted).toBe(true);
    expect(item.reason).toBe("");      // 原理由描述的是已被推翻的否定判断
    expect(item.evidence).toBe("");    // 原依据无法核对
  });

  it("未发生提升时不带 autoPromoted 标记", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "not_recommended", evidence: "a 主导了性能优化" }] },
      { entities: [entity("a")], ...opts }
    );
    expect(analysis.items.a.autoPromoted).toBeUndefined();
    expect(analysis.items.a.reason).toBe("");
  });

  it("推荐不需要举证", () => {
    const { corrections } = validateMatchResult(
      { items: [{ id: "a", level: "recommended", evidence: "" }] },
      { entities: [entity("a")], ...opts }
    );
    expect(corrections).toEqual([]);
  });
});

describe("validateMatchResult — 技能不臆造", () => {
  it("找不到出处的技能被丢弃", () => {
    const { analysis, corrections } = validateMatchResult(
      {
        items: [
          { id: "a", level: "recommended", matchedSkills: ["React", "WebGL", "Kubernetes"] },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.matchedSkills).toEqual(["React"]);
    expect(corrections.filter((c) => c.type === "skill_not_found")).toHaveLength(2);
  });

  it("描述中出现的技能也算有出处", () => {
    const e = entity("a", { skills: [], description: "<p>使用 Webpack 优化构建</p>" });
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "recommended", matchedSkills: ["Webpack"] }] },
      { entities: [e], ...opts }
    );
    expect(analysis.items.a.matchedSkills).toEqual(["Webpack"]);
  });
});

describe("validateMatchResult — 遗漏与 top-N", () => {
  it("模型漏掉的条目补为推荐，不静默丢弃", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "recommended" }] },
      { entities: [entity("a"), entity("b")], ...opts }
    );

    expect(analysis.items.b).toBeDefined();
    expect(analysis.items.b.level).toBe("recommended");
    expect(analysis.rankedIds).toContain("b");
  });

  it("rankedIds 覆盖全部条目且不重复", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "recommended" }] },
      { entities: [entity("a"), entity("b"), entity("c")], ...opts }
    );

    expect([...analysis.rankedIds].sort()).toEqual(["a", "b", "c"]);
    expect(new Set(analysis.rankedIds).size).toBe(3);
  });

  it("只给前 N 个「推荐」打 top-N 标记，不推荐的不占名额", () => {
    const entities = ["a", "b", "c", "d", "e", "f"].map((id) => entity(id));
    const { analysis } = validateMatchResult(
      {
        items: [
          { id: "a", level: "not_recommended", evidence: "a 主导了性能优化" },
          { id: "b", level: "recommended" },
          { id: "c", level: "recommended" },
          { id: "d", level: "recommended" },
          { id: "e", level: "recommended" },
          { id: "f", level: "recommended" },
        ],
      },
      { entities, topN: 3, ...opts }
    );

    expect(analysis.items.a.inTopN).toBe(false);
    expect(analysis.items.b.inTopN).toBe(true);
    expect(analysis.items.c.inTopN).toBe(true);
    expect(analysis.items.d.inTopN).toBe(true);
    expect(analysis.items.e.inTopN).toBe(false);
    expect(analysis.items.f.inTopN).toBe(false);
  });

  it("推荐数少于 top-N 时不越界", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a", level: "recommended" }] },
      { entities: [entity("a")], topN: 5, ...opts }
    );
    expect(analysis.items.a.inTopN).toBe(true);
  });
});

describe("validateMatchResult — 容错", () => {
  it("空对象 / null / 非对象输入不抛异常", () => {
    for (const bad of [null, undefined, {}, [], "字符串", 42]) {
      expect(() =>
        validateMatchResult(bad, { entities: [entity("a")], ...opts })
      ).not.toThrow();
    }
  });

  it("items 不是数组时全部补为推荐", () => {
    const { analysis } = validateMatchResult(
      { items: "不是数组" },
      { entities: [entity("a"), entity("b")], ...opts }
    );
    expect(Object.keys(analysis.items)).toEqual(["a", "b"]);
  });

  it("汇总字段缺失时给出空值而非 undefined", () => {
    const { analysis } = validateMatchResult({}, { entities: [], ...opts });
    expect(analysis.summary.coverage).toEqual({ covered: [], weak: [], missing: [] });
    expect(analysis.summary.advice).toBe("");
  });
});

describe("parseMatchPayload", () => {
  it("解析纯 JSON", () => {
    expect(parseMatchPayload('{"items":[]}')).toEqual({ items: [] });
  });

  it("解析被 ```json 包裹的 JSON", () => {
    expect(parseMatchPayload('```json\n{"items":[]}\n```')).toEqual({ items: [] });
  });

  it("从前后废话中提取 JSON", () => {
    expect(parseMatchPayload('好的，分析如下：{"items":[]} 希望对你有帮助')).toEqual({
      items: [],
    });
  });

  it("无法解析时返回 null", () => {
    expect(parseMatchPayload("完全不是 JSON")).toBeNull();
  });
});

describe("证据比对的分隔符容忍", () => {
  const entity = {
    id: "e1",
    type: "languages" as const,
    sectionId: "languages",
    title: "英语",
    subtitle: "CET-6 · 可熟练阅读英文技术文档，能参与英文会议",
    dateRange: "",
    description: "",
    tags: [],
    skills: [],
    metrics: [],
    order: 0,
    createdAt: "",
    updatedAt: "",
  };

  const runWith = (evidence: string) =>
    validateMatchResult(
      {
        items: [
          {
            id: "e1",
            level: "not_recommended",
            reason: "岗位未要求英语",
            evidence,
            matchedSkills: [],
            missingSkills: [],
          },
        ],
        summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: [] }, advice: "" },
      },
      { entities: [entity], modelId: "m", promptVersion: "v", analyzedAt: "", topN: 5 }
    );

  it("模型把标题与副标题用 | 拼起来引用，仍算引到了原文", () => {
    // 实测踩到：模型引的是「英语 | CET-6 · …」，而原文里两字段是空格连的。
    // 精确子串匹配会判失败，把正确的否定判断推翻成推荐。
    const { analysis } = runWith("英语 | CET-6 · 可熟练阅读英文技术文档，能参与英文会议");
    expect(analysis.items.e1.level).toBe("not_recommended");
    expect(analysis.items.e1.autoPromoted).toBeUndefined();
  });

  it("斜杠、顿号等分隔符同样容忍", () => {
    expect(runWith("英语/CET-6 · 可熟练阅读英文技术文档").analysis.items.e1.level).toBe(
      "not_recommended"
    );
  });

  it("内容对不上仍然推翻 —— 容忍分隔符不等于容忍编造", () => {
    const { analysis } = runWith("英语 | 日语 N1 · 可同声传译");
    expect(analysis.items.e1.level).toBe("recommended");
    expect(analysis.items.e1.autoPromoted).toBe(true);
  });
});
