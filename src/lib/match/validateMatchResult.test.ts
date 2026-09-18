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
  promptVersion: "v4",
  analyzedAt: "2026-01-01T00:00:00.000Z",
};

/** 排序语义下，模型只返回 id、理由与技能 —— 不再有 level/evidence */
const item = (id: string, over: Record<string, unknown> = {}) => ({ id, ...over });

const e = (id: string) => entity(id);

const run = (
  payload: unknown,
  entities: ProfileEntity[],
  extra: Record<string, unknown> = {}
) => validateMatchResult(payload, { entities, ...opts, ...extra });

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
          { id: "a", reason: "第一条的理由" },
          { id: "a", reason: "第二条的理由" },
        ],
      },
      { entities: [entity("a")], ...opts }
    );

    expect(analysis.items.a.reason).toBe("第一条的理由");
    expect(analysis.rankedIds).toEqual(["a"]);
    expect(corrections.some((c) => c.type === "duplicate")).toBe(true);
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
  it("模型漏掉的条目补在末尾，并记录 omitted —— 排序任务里「没提到」是最低优先级，不是不推荐", () => {
    const { analysis, corrections } = run(
      { items: [item("a"), item("b")] },
      [e("a"), e("b"), e("c")],
      { topN: 2 }
    );
    expect(analysis.rankedIds).toEqual(["a", "b", "c"]);
    expect(corrections.some((c) => c.type === "omitted" && c.entityId === "c")).toBe(true);
    expect(analysis.items.c.inTopN).toBe(false);
  });

  it("rankedIds 覆盖全部条目且不重复", () => {
    const { analysis } = validateMatchResult(
      { items: [{ id: "a" }] },
      { entities: [entity("a"), entity("b"), entity("c")], ...opts }
    );

    expect([...analysis.rankedIds].sort()).toEqual(["a", "b", "c"]);
    expect(new Set(analysis.rankedIds).size).toBe(3);
  });

  it("前 N 条标★并记为推荐，其余记为不推荐 —— 划线由代码做，不由模型做", () => {
    const { analysis } = run(
      { items: [item("a"), item("b"), item("c"), item("d")] },
      [e("a"), e("b"), e("c"), e("d")],
      { topN: 2 }
    );
    expect(analysis.items.a.inTopN).toBe(true);
    expect(analysis.items.b.inTopN).toBe(true);
    expect(analysis.items.c.inTopN).toBe(false);
    expect(analysis.items.a.level).toBe("recommended");
    expect(analysis.items.c.level).toBe("not_recommended");
    expect(analysis.summary.recommendedCount).toBe(2);
  });

  it("条目数少于 top-N 时不越界", () => {
    const { analysis } = run({ items: [item("a")] }, [e("a")], { topN: 5 });
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

  it("items 不是数组时，全部条目仍出现在 rankedIds 里", () => {
    const { analysis } = validateMatchResult(
      { items: "不是数组" },
      { entities: [entity("a"), entity("b")], ...opts }
    );
    expect(Object.keys(analysis.items)).toEqual(["a", "b"]);
    expect(analysis.rankedIds).toEqual(["a", "b"]);
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
