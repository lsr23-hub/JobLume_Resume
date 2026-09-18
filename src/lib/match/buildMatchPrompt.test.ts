import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import {
  buildMatchPrompt,
  orderEntitiesForPrompt,
  stripHtml,
} from "./buildMatchPrompt";

const entity = (
  id: string,
  over: Partial<ProfileEntity> = {}
): ProfileEntity => ({
  id,
  type: "experience",
  sectionId: "experience",
  title: `标题-${id}`,
  subtitle: "职位",
  dateRange: "2021.07 - 2024.12",
  description: `<ul><li>${id} 做了什么</li></ul>`,
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const baseInput = {
  jdRaw: "岗位职责：负责前端架构设计与性能优化。任职要求：精通 React 与 TypeScript，有大型项目经验。",
  company: "字节跳动",
  position: "高级前端工程师",
};

describe("stripHtml", () => {
  it("去掉标签、解码实体、压缩空白", () => {
    expect(stripHtml("<ul>\n  <li>a &amp; b</li>\n</ul>")).toBe("a & b");
    expect(stripHtml("<p>a</p><p>b</p>")).toBe("a b");
    expect(stripHtml("  <b>x</b>&nbsp;y  ")).toBe("x y");
  });

  it("纯文本原样返回（仅裁剪）", () => {
    expect(stripHtml("  没有标签  ")).toBe("没有标签");
  });
});

describe("orderEntitiesForPrompt", () => {
  it("按板块顺序排列", () => {
    const list = [
      entity("p", { sectionId: "projects" }),
      entity("e", { sectionId: "experience" }),
      entity("d", { sectionId: "education" }),
    ];
    // SECTION_DEFS 顺序：education(1) → experience(2) → projects(4)
    // （certificates 已下沉为技能板块下的纯文本，不再是独立板块）
    expect(orderEntitiesForPrompt(list).map((x) => x.id)).toEqual(["d", "e", "p"]);
  });

  it("同板块内按结束时间降序，进行中的最前", () => {
    const list = [
      entity("old", { endTimestamp: 100 }),
      entity("new", { endTimestamp: 300 }),
      entity("now", { isCurrent: true }),
      entity("mid", { endTimestamp: 200 }),
    ];
    expect(orderEntitiesForPrompt(list).map((x) => x.id)).toEqual([
      "now",
      "new",
      "mid",
      "old",
    ]);
  });

  it("无时间信息的排在末尾", () => {
    const list = [entity("none"), entity("has", { endTimestamp: 100 })];
    expect(orderEntitiesForPrompt(list).map((x) => x.id)).toEqual(["has", "none"]);
  });

  it("完全同序时按 id 升序，保证结果与输入顺序无关", () => {
    const a = [entity("b"), entity("a"), entity("c")];
    const b = [entity("c"), entity("b"), entity("a")];
    expect(orderEntitiesForPrompt(a).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(orderEntitiesForPrompt(b).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("buildMatchPrompt — 确定性（可复现性的核心断言）", () => {
  const entities = [
    entity("a", { endTimestamp: 300, tags: ["金融"] }),
    entity("b", { endTimestamp: 200 }),
    entity("c", { sectionId: "projects", tags: ["计算机"] }),
  ];

  it("同一输入调用 100 次，输出逐字节相同", () => {
    const first = buildMatchPrompt({ ...baseInput, entities });
    for (let i = 0; i < 100; i++) {
      expect(buildMatchPrompt({ ...baseInput, entities })).toBe(first);
    }
  });

  it("输入数组顺序打乱后，输出完全相同", () => {
    const shuffled = [entities[2], entities[0], entities[1]];
    expect(buildMatchPrompt({ ...baseInput, entities: shuffled })).toBe(
      buildMatchPrompt({ ...baseInput, entities })
    );
  });

  it("不依赖 Date.now —— 两次调用间隔中时间变化不影响输出", () => {
    const a = buildMatchPrompt({ ...baseInput, entities });
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* 空转 5ms */
    }
    expect(buildMatchPrompt({ ...baseInput, entities })).toBe(a);
  });
});

describe("buildMatchPrompt — 内容", () => {
  const entities = [
    entity("a", {
      title: "字节跳动",
      subtitle: "高级前端",
      endTimestamp: 300,
      skills: ["React", "TypeScript"],
      metrics: ["构建 8min→2min"],
      description: "<ul><li>主导性能优化</li></ul>",
    }),
  ];

  it("包含 JD 原文与公司职位", () => {
    const prompt = buildMatchPrompt({ ...baseInput, entities });
    expect(prompt).toContain("字节跳动");
    expect(prompt).toContain("高级前端工程师");
    expect(prompt).toContain(baseInput.jdRaw);
  });

  it("条目序列化包含 id / 标题 / 技能 / 成果", () => {
    const prompt = buildMatchPrompt({ ...baseInput, entities });
    expect(prompt).toContain("[a]");
    expect(prompt).toContain("技能：React、TypeScript");
    expect(prompt).toContain("成果：构建 8min→2min");
    expect(prompt).toContain("描述：主导性能优化");
  });

  it("空技能/成果/描述显示占位而不是空白", () => {
    const bare = [entity("z", { description: "" })];
    const prompt = buildMatchPrompt({ ...baseInput, entities: bare });
    expect(prompt).toContain("技能：未标注");
    expect(prompt).toContain("成果：未标注");
    expect(prompt).toContain("描述：（无）");
  });

  it("描述截断到 300 字", () => {
    const long = [entity("L", { description: "字".repeat(500) })];
    const prompt = buildMatchPrompt({ ...baseInput, entities: long });
    expect(prompt).toContain(`${"字".repeat(300)}…`);
    expect(prompt).not.toContain("字".repeat(301));
  });

  it("要求全量排序，且不再向模型索取二分判定", () => {
    // v4 起把「在哪划线」从模型手里拿走 —— 那条线取决于用户这份简历
    // 放得下几条，而这个信息不在 prompt 里。模型只排序，截断交给代码。
    const prompt = buildMatchPrompt({ ...baseInput, entities });
    expect(prompt).toContain("排序");
    expect(prompt).toContain("每条候选经历都必须出现");
    expect(prompt).not.toContain("recommended");
    expect(prompt).not.toContain("evidence");
  });

  it("没有条目时不抛异常", () => {
    expect(() => buildMatchPrompt({ ...baseInput, entities: [] })).not.toThrow();
  });
});
