import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import { buildTagPrompt } from "./buildTagPrompt";
import { resolveCategory, validateTagResult } from "./analyzeTags";
import { CATEGORY_IDS, needsCategorizing } from "./categories";

const entity = (id: string, over: Partial<ProfileEntity> = {}): ProfileEntity => ({
  id,
  type: "experience",
  sectionId: "experience",
  title: `条目 ${id}`,
  subtitle: "工程师",
  dateRange: "2022.03 - 至今",
  description: "",
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("buildTagPrompt", () => {
  const entities = [entity("a"), entity("b"), entity("c")];

  it("逐字节确定 —— 可复现性的底线", () => {
    const first = buildTagPrompt({ entities });
    for (let i = 0; i < 100; i += 1) {
      expect(buildTagPrompt({ entities })).toBe(first);
    }
  });

  it("与输入数组顺序无关", () => {
    const shuffled = [entities[2], entities[0], entities[1]];
    expect(buildTagPrompt({ entities: shuffled })).toBe(buildTagPrompt({ entities }));
  });

  it("把整个类别词表交给模型 —— 封闭集才有可复现性", () => {
    const prompt = buildTagPrompt({ entities });
    for (const id of CATEGORY_IDS) expect(prompt).toContain(`- ${id}：`);
  });

  it("每条经历都出现，且带 id", () => {
    const prompt = buildTagPrompt({ entities });
    for (const e of entities) expect(prompt).toContain(`[${e.id}]`);
  });

  it("明确要求只能从词表里选", () => {
    const prompt = buildTagPrompt({ entities });
    expect(prompt).toContain("只能从这些里选");
    expect(prompt).toContain("不要自己造");
  });
});

describe("resolveCategory —— 词表外的值一律不猜", () => {
  it("严格相等直接通过", () => {
    expect(resolveCategory("金融")).toBe("金融");
  });

  it("带修饰的说法能认出来：「金融行业」→ 金融", () => {
    expect(resolveCategory("金融行业")).toBe("金融");
    expect(resolveCategory("互联网 / 软件")).toBe("互联网");
  });

  it("同时命中两个类别时不猜 —— 猜错的类别会直接驱动排序衰减", () => {
    expect(resolveCategory("金融互联网")).toBeNull();
  });

  it("完全对不上时返回 null，不退回「其他」", () => {
    expect(resolveCategory("科技")).toBeNull();
    expect(resolveCategory("")).toBeNull();
    expect(resolveCategory(undefined)).toBeNull();
    expect(resolveCategory(42)).toBeNull();
  });
});

describe("validateTagResult", () => {
  const entities = [entity("a"), entity("b")];

  it("合法输入干净通过", () => {
    const { categories, corrections } = validateTagResult(
      { items: [{ id: "a", category: "金融" }, { id: "b", category: "学术" }] },
      entities
    );
    expect(categories).toEqual({ a: "金融", b: "学术" });
    expect(corrections).toEqual([]);
  });

  it("不存在的 id 丢弃并记录", () => {
    const { categories, corrections } = validateTagResult(
      { items: [{ id: "ghost", category: "金融" }, { id: "a", category: "金融" }] },
      entities
    );
    expect(Object.keys(categories)).toEqual(["a"]);
    expect(corrections).toContainEqual(expect.objectContaining({ type: "unknown_id" }));
  });

  it("词表外的类别丢弃并记录，且**不写进去**", () => {
    const { categories, corrections } = validateTagResult(
      { items: [{ id: "a", category: "量子计算" }] },
      entities
    );
    expect(categories).toEqual({});
    expect(corrections).toContainEqual(
      expect.objectContaining({ entityId: "a", type: "invalid_category" })
    );
  });

  it("重复 id 保留第一条", () => {
    const { categories, corrections } = validateTagResult(
      { items: [{ id: "a", category: "金融" }, { id: "a", category: "学术" }] },
      entities
    );
    expect(categories.a).toBe("金融");
    expect(corrections.some((c) => c.type === "duplicate")).toBe(true);
  });

  it("模型漏掉的条目记为 omitted，不编一个类别给它", () => {
    const { categories, corrections } = validateTagResult(
      { items: [{ id: "a", category: "金融" }] },
      entities
    );
    expect("b" in categories).toBe(false);
    expect(corrections).toContainEqual(
      expect.objectContaining({ entityId: "b", type: "omitted" })
    );
  });

  it("垃圾输入不抛异常", () => {
    for (const bad of [null, undefined, "字符串", 42, [], { items: "不是数组" }]) {
      const { categories } = validateTagResult(bad, entities);
      expect(categories).toEqual({});
    }
  });

  it("每一条产出的类别都在词表里", () => {
    const { categories } = validateTagResult(
      { items: [{ id: "a", category: "金融行业" }, { id: "b", category: "乱写" }] },
      entities
    );
    for (const value of Object.values(categories)) {
      expect(CATEGORY_IDS).toContain(value);
    }
  });
});

describe("needsCategorizing —— 什么时候才该被自动归类写入", () => {
  it("空位要填", () => {
    expect(needsCategorizing(undefined)).toBe(true);
    expect(needsCategorizing("")).toBe(true);
    expect(needsCategorizing("   ")).toBe(true);
  });

  it("已经是规范类别的不动 —— 那是用户明确的选择，机器不该推翻", () => {
    expect(needsCategorizing("金融")).toBe(false);
    expect(needsCategorizing("学术")).toBe(false);
  });

  it("非规范值要归一化 —— 否则衰减会按各人随手写的字符串分组", () => {
    // 实测发现：档案里早就有手工标签时，只填空位等于这个功能对老用户不起作用
    expect(needsCategorizing("计算机")).toBe(true);
    expect(needsCategorizing("数据")).toBe(true);
    expect(needsCategorizing("统计")).toBe(true);
  });
});
