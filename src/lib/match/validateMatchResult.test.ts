import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import { parseMatchPayload, requirementsOf, validateMatchResult } from "./validateMatchResult";
import type { MatchAnalysis } from "@/types/jobTarget";

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
  promptVersion: "v5",
  analyzedAt: "2026-01-01T00:00:00.000Z",
  /** 要求项的原文依据要拿它核对 */
  jdRaw: "岗位要求：\n1. 精通 React；\n2. 5 年以上前端开发经验；\n3. 有组件库建设经验。",
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

// ─────────────────────────────────────────────────────────────
// prompt v5：结构化要求项
// ─────────────────────────────────────────────────────────────

const req = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  text: "5 年以上前端开发经验",
  keys: ["前端开发经验"],
  kind: "must",
  status: "covered",
  entityIds: ["a"],
  sourceQuote: "5 年以上前端开发经验",
  ...over,
});

describe("要求项 —— 派生 coverage", () => {
  it("按 status 分组，取 keys 而不是整句", () => {
    const { analysis } = run(
      {
        requirements: [
          req({ id: "r1", status: "covered", keys: ["React"] }),
          {
            id: "r2",
            text: "熟悉 Node",
            keys: ["Node"],
            kind: "nice",
            status: "weak",
            entityIds: ["a"],
            sourceQuote: "",
          },
          {
            id: "r3",
            text: "缺失的技能",
            keys: ["Kubernetes"],
            kind: "must",
            status: "missing",
            entityIds: [],
            sourceQuote: "",
          },
        ],
      },
      [e("a")]
    );
    expect(analysis.summary.coverage.covered).toEqual(["React"]);
    expect(analysis.summary.coverage.weak).toEqual(["Node"]);
    expect(analysis.summary.coverage.missing).toEqual(["Kubernetes"]);
  });

  it("职责不进入 coverage —— 没做过某段职责不是缺陷", () => {
    const { analysis } = run(
      {
        requirements: [
          req({
            id: "r1",
            text: "负责日常报表产出",
            kind: "duty",
            status: "missing",
            keys: ["负责报表产出"],
            entityIds: [],
          }),
          req({ id: "r2", text: "精通 React", kind: "must", status: "covered", keys: ["React"] }),
        ],
      },
      [e("a")]
    );
    expect(analysis.summary.coverage.missing).toEqual([]);
    expect(analysis.summary.coverage.covered).toEqual(["React"]);
    // 但职责本身仍然保留在要求列表里，界面上单独成组
    expect(analysis.requirements?.map((r) => r.kind)).toEqual(["duty", "must"]);
  });

  it("重复的 key 只出现一次", () => {
    const { analysis } = run(
      {
        requirements: [
          req({ id: "r1", status: "covered", keys: ["React"] }),
          req({ id: "r2", status: "covered", keys: ["React"], text: "另一条也提到 React" }),
        ],
      },
      [e("a")]
    );
    expect(analysis.summary.coverage.covered).toEqual(["React"]);
  });
});

describe("要求项 —— 证据不足一律落到 weak", () => {
  it("标 covered 却指不出经历 → 降级并记录", () => {
    const { analysis, corrections } = run(
      { requirements: [req({ status: "covered", entityIds: [] })] },
      [e("a")]
    );
    expect(analysis.requirements?.[0].status).toBe("weak");
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "no_evidence" })
    );
  });

  it("指向的经历不存在 → 丢弃该 id，随后因无证据降级", () => {
    const { analysis, corrections } = run(
      { requirements: [req({ entityIds: ["ghost"] })] },
      [e("a")]
    );
    expect(analysis.requirements?.[0].entityIds).toEqual([]);
    expect(analysis.requirements?.[0].status).toBe("weak");
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "unknown_entity" })
    );
  });

  it("标 missing 却又指出支撑经历 → 自相矛盾，按 weak 处理", () => {
    // 宁可软着陆：说「你缺这个」说错了，会让用户以为自己不够格、白跑一趟
    const { analysis, corrections } = run(
      { requirements: [req({ status: "missing", entityIds: ["a"] })] },
      [e("a")]
    );
    expect(analysis.requirements?.[0].status).toBe("weak");
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "no_evidence" })
    );
  });

  it("status 取值非法 → 按 weak 处理并记录", () => {
    const { analysis, corrections } = run(
      { requirements: [req({ status: "probably" })] },
      [e("a")]
    );
    expect(analysis.requirements?.[0].status).toBe("weak");
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "invalid_field" })
    );
  });
});

describe("要求项 —— 原文依据", () => {
  it("依据在 JD 里找得到就保留", () => {
    const { analysis, corrections } = run(
      { requirements: [req({ sourceQuote: "精通 React" })] },
      [e("a")]
    );
    expect(analysis.requirements?.[0].sourceQuote).toBe("精通 React");
    expect(corrections.filter((c) => c.scope === "requirement")).toEqual([]);
  });

  it("依据在 JD 里找不到 → 清空但**不丢弃这条要求**", () => {
    // 隐含要求本来就引不出原文，丢掉它等于丢掉最有价值的那部分
    const { analysis, corrections } = run(
      { requirements: [req({ sourceQuote: "熟悉 Rust 与 WebAssembly" })] },
      [e("a")]
    );
    expect(analysis.requirements).toHaveLength(1);
    expect(analysis.requirements?.[0].sourceQuote).toBe("");
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "no_evidence" })
    );
  });

  it("引不出原文的要求照样进 coverage —— 只是不能声称有依据", () => {
    const { analysis } = run(
      {
        requirements: [
          req({ status: "missing", entityIds: [], sourceQuote: "JD 里没有这句" , keys: ["隐含要求"] }),
        ],
      },
      [e("a")]
    );
    expect(analysis.summary.coverage.missing).toEqual(["隐含要求"]);
  });

  it("分隔符差异不算找不到依据", () => {
    const { analysis } = run({ requirements: [req({ sourceQuote: "精通 | React" })] }, [e("a")]);
    expect(analysis.requirements?.[0].sourceQuote).toBe("精通 | React");
  });
});

describe("要求项 —— 去重与容错", () => {
  it("内容重复的要求保留第一条", () => {
    const { analysis, corrections } = run(
      {
        requirements: [
          req({ id: "r1", text: "精通 React" }),
          req({ id: "r2", text: "精通React" }),
        ],
      },
      [e("a")]
    );
    expect(analysis.requirements).toHaveLength(1);
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "invalid_field" })
    );
  });

  it("没有 text 的要求丢弃", () => {
    const { analysis } = run({ requirements: [req({ text: "   " })] }, [e("a")]);
    expect(analysis.requirements).toEqual([]);
  });

  it("完全没给 requirements 时不炸 —— 旧缓存与容错路径都走这里", () => {
    const { analysis } = run({ items: [] }, [e("a")]);
    expect(analysis.requirements).toEqual([]);
    expect(analysis.summary.coverage).toEqual({ covered: [], weak: [], missing: [] });
  });

  it("requirements 不是数组时按空处理", () => {
    const { analysis } = run({ requirements: "不是数组" }, [e("a")]);
    expect(analysis.requirements).toEqual([]);
  });
});

describe("条目引用要求 id", () => {
  it("引用存在的要求 id 时保留", () => {
    const { analysis } = run(
      {
        requirements: [req({ id: "r1" })],
        items: [{ id: "a", requirementIds: ["r1"] }],
      },
      [e("a")]
    );
    expect(analysis.items.a.requirementIds).toEqual(["r1"]);
  });

  it("引用不存在的要求 id → 丢弃并记录", () => {
    const { analysis, corrections } = run(
      { requirements: [req({ id: "r1" })], items: [{ id: "a", requirementIds: ["r9"] }] },
      [e("a")]
    );
    expect(analysis.items.a.requirementIds).toEqual([]);
    expect(corrections).toContainEqual(
      expect.objectContaining({ scope: "requirement", type: "unknown_requirement" })
    );
  });
});

describe("reason 截断", () => {
  it("超过 40 字截断而不是丢弃 —— prompt 说 20 字，校验器不能只靠模型听话", () => {
    const long = "这".repeat(80);
    const { analysis } = run({ items: [{ id: "a", reason: long }] }, [e("a")]);
    expect(analysis.items.a.reason).toHaveLength(40);
  });

  it("短理由原样保留", () => {
    const { analysis } = run({ items: [{ id: "a", reason: "对应职责 3" }] }, [e("a")]);
    expect(analysis.items.a.reason).toBe("对应职责 3");
  });
});

describe("Correction 带 scope，两个维度分得开", () => {
  it("entity 维度与 requirement 维度的记录不会互相混入", () => {
    const { corrections } = run(
      {
        requirements: [req({ status: "covered", entityIds: [] })],
        items: [{ id: "ghost" }],
      },
      [e("a")]
    );
    const entityOnes = corrections.filter((c) => c.scope === "entity");
    const requirementOnes = corrections.filter((c) => c.scope === "requirement");
    expect(entityOnes.map((c) => c.type)).toContain("unknown_id");
    expect(requirementOnes.map((c) => c.type)).toContain("no_evidence");
    // 编译器帮忙：收窄后才能摸 entityId / requirementId
    for (const c of entityOnes) expect(typeof c.entityId).toBe("string");
    for (const c of requirementOnes) expect(typeof c.requirementId).toBe("string");
  });
});

describe("requirementsOf —— 旧数据的回退路径", () => {
  const legacyAnalysis = (coverage: { covered: string[]; weak: string[]; missing: string[] }) =>
    ({
      items: {},
      rankedIds: [],
      topN: 5,
      summary: { recommendedCount: 0, coverage, advice: "" },
      modelId: "deepseek-chat",
      promptVersion: "v4",
      analyzedAt: "2026-01-01T00:00:00.000Z",
      // 注意：没有 requirements 字段 —— prompt v5 之前的分析就长这样，
      // localStorage 里和用户的备份文件里都有这种对象
    }) as unknown as MatchAnalysis;

  it("旧分析没有 requirements 时由旧的三个数组反推，而不是当成空清单", () => {
    // 显示「暂无要求」是错的：那份数据其实有内容，只是指不到经历
    const result = requirementsOf(
      legacyAnalysis({ covered: ["React"], weak: [], missing: ["Kubernetes"] })
    );
    expect(result.map((r) => [r.status, r.text])).toEqual([
      ["covered", "React"],
      ["missing", "Kubernetes"],
    ]);
    // 旧数据没有经历引用，也没有原文依据 —— 界面据此标「无原文依据」
    expect(result.every((r) => r.entityIds.length === 0 && r.sourceQuote === "")).toBe(true);
  });

  it("新数据直接返回，不走回退", () => {
    const { analysis } = run({ requirements: [req({ id: "r1", text: "精通 React" })] }, [e("a")]);
    expect(requirementsOf(analysis).map((r) => r.id)).toEqual(["r1"]);
  });

  it("null 与缺字段都不抛异常", () => {
    expect(requirementsOf(null)).toEqual([]);
    expect(requirementsOf(undefined)).toEqual([]);
    expect(
      requirementsOf({ summary: {} } as unknown as MatchAnalysis)
    ).toEqual([]);
  });

  it("旧数据的三个数组为空时返回空数组（这时候显示「暂无要求」才是对的）", () => {
    expect(requirementsOf(legacyAnalysis({ covered: [], weak: [], missing: [] }))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// 对抗性：模型能不能把「不存在的东西」说成存在
//
// 已有的规则各自钉在对应的小节里（编造技能 → skill_not_found、
// 编造原文依据 → 清空 sourceQuote、声称 covered 却指不出经历 → 降级、
// 编造条目 / 要求 id → 丢弃）。这里只放**现有规则拦不住**的那一类。
// ─────────────────────────────────────────────────────────────

describe("对抗性 —— 指向「真实但无关」的经历", () => {
  it("当前拦不住：校验只查经历存不存在，不查它与这条要求有没有关系", () => {
    // 场景：模型声称「精通 Rust」由 a 支撑，而 a 是一段纯前端经历。
    // entityIds 指向的 id 真实存在 → 通过全部校验 → 界面上以
    // 「你具备精通 Rust（由前端工程师支撑）」的姿态出现。
    //
    // 为什么没修：判断「这条经历跟这条要求有没有关系」只能靠字符串匹配，
    // 而要求是整句、经历里未必出现同样的词（要求写「5 年以上前端经验」，
    // 经历写「高级前端工程师」）—— 误杀正常判定比漏掉这一类的代价更大。
    // 真要收紧得引入语义判断，那是另一个量级的改动。
    //
    // 这条测试是**故意钉住这个缺口**：将来谁加了相关性校验，
    // 它会失败并提醒把这里与 docs/07 的说明一起改掉。
    const { analysis, corrections } = run(
      {
        requirements: [
          req({
            id: "r1",
            text: "精通 Rust",
            keys: ["Rust"],
            status: "covered",
            entityIds: ["a"],
            sourceQuote: "",
          }),
        ],
      },
      [entity("a", { title: "前端工程师", description: "<p>写 React 与 TypeScript</p>" })]
    );

    expect(analysis.requirements?.[0].status).toBe("covered");
    expect(
      corrections.filter((c) => c.scope === "requirement" && c.type === "no_evidence")
    ).toEqual([]);
  });

  it("对照组：指不出经历时会被降级 —— 说明这道闸门是有效的，只是不够细", () => {
    const { analysis, corrections } = run(
      {
        requirements: [
          req({ id: "r1", text: "精通 Rust", keys: ["Rust"], status: "covered", entityIds: [], sourceQuote: "" }),
        ],
      },
      [entity("a")]
    );
    expect(analysis.requirements?.[0].status).toBe("weak");
    expect(
      corrections.some((c) => c.scope === "requirement" && c.type === "no_evidence")
    ).toBe(true);
  });
});
