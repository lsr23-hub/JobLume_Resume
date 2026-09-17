import { describe, expect, it, vi } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import { A4_HEIGHT_PX } from "@/hooks/useAutoOnePage";
import { buildCutOrder, pageStateOf, planFit, type PlanFitInput } from "./pageBudget";

const PADDING = 32;
/** A4 一页的可用内容高度（未缩放时） */
const PER_PAGE = A4_HEIGHT_PX - 2 * PADDING;

const entity = (
  id: string,
  sectionId: string,
  order: number,
  title = id
): ProfileEntity => ({
  id,
  type: "custom",
  sectionId,
  title,
  subtitle: "",
  dateRange: "",
  description: "",
  tags: [],
  skills: [],
  metrics: [],
  order,
  createdAt: "",
  updatedAt: "",
});

/**
 * 每条固定高度的假测量：内容高度 = 上下 padding + 各条高度之和。
 * 真实实现走离屏渲染（`measureResume`），本模块只依赖「给一版选择、还一个高度」。
 */
const fakeMeasure =
  (heights: Record<string, number>) =>
  async (selection: Record<string, string[]>): Promise<number> =>
    2 * PADDING +
    Object.values(selection)
      .flat()
      .reduce((sum, id) => sum + (heights[id] ?? 0), 0);

/** 假测量不区分版面宽度（真实实现要按 scaleFactor 换宽度排版，见 measureResume） */

const uniform = (ids: string[], height: number) =>
  Object.fromEntries(ids.map((id) => [id, height]));

const entitiesOf = (...list: ProfileEntity[]) =>
  Object.fromEntries(list.map((e) => [e.id, e]));

describe("pageStateOf", () => {
  it("刚好装下时是 1 页，且不缩放", () => {
    const state = pageStateOf(2 * PADDING + PER_PAGE, PADDING);
    expect(state).toMatchObject({ pages: 1, scaleFactor: 1, cannotFit: false });
  });

  it("超出但在 0.9 倍以内 —— 靠缩放就能回到 1 页，不需要删内容", () => {
    // 实际内容 1.05 页：idealScale ≈ 0.952 ≥ 0.9，缩放后正好一页
    const state = pageStateOf(2 * PADDING + PER_PAGE * 1.05, PADDING);
    expect(state.pages).toBe(1);
    expect(state.scaleFactor).toBeLessThan(1);
    expect(state.cannotFit).toBe(false);
  });

  it("缩到下限仍装不下时按 0.9 计页数，并标记 cannotFit", () => {
    const state = pageStateOf(2 * PADDING + PER_PAGE * 2, PADDING);
    expect(state.scaleFactor).toBe(0.9);
    expect(state.cannotFit).toBe(true);
    // 2 * PER_PAGE / (PER_PAGE / 0.9) = 1.8 → 2 页
    expect(state.pages).toBe(2);
  });

  it("高度为 0 时不报 0 页", () => {
    expect(pageStateOf(0, PADDING).pages).toBe(1);
  });
});

describe("buildCutOrder", () => {
  const entities = entitiesOf(
    entity("a", "experience", 0),
    entity("b", "experience", 1),
    entity("c", "projects", 0),
    entity("d", "projects", 1)
  );
  const selection = { experience: ["a", "b"], projects: ["c", "d"] };

  it("没有 AI 序列时，从数据库排序的末尾开始删", () => {
    expect(buildCutOrder(selection, entities)).toEqual(["d", "c", "b", "a"]);
  });

  it("有 AI 序列时取其倒序", () => {
    expect(buildCutOrder(selection, entities, ["c", "a", "b", "d"])).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  it("序列外的条目排在最前 —— 它们最先被删", () => {
    // d 是分析之后才新增的，AI 没见过它
    expect(buildCutOrder(selection, entities, ["c", "a", "b"])[0]).toBe("d");
  });

  it("块内按 order 排，不受 selection 数组顺序影响", () => {
    const shuffled = { experience: ["b", "a"], projects: ["d", "c"] };
    expect(buildCutOrder(shuffled, entities)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("planFit", () => {
  const base = (over: Partial<PlanFitInput>): PlanFitInput => ({
    selection: {},
    entities: {},
    pagePadding: PADDING,
    measure: async () => 0,
    ...over,
  });

  it("已经装得下时不做任何提议", async () => {
    const measure = vi.fn(fakeMeasure(uniform(["a", "b"], 100)));
    const plan = await planFit(
      base({
        selection: { experience: ["a", "b"] },
        entities: entitiesOf(entity("a", "experience", 0), entity("b", "experience", 1)),
        measure,
      })
    );

    expect(plan.removed).toEqual([]);
    expect(plan.pagesBefore).toBe(1);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("逐条移除直到刚好装进目标页数", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        measure: fakeMeasure(uniform(ids, 100)),
      })
    );

    // 13 条 × 100px = 1300px 实际内容。缩到下限仍是 2 页，删 2 条才回到 1 页
    expect(plan.pagesBefore).toBe(2);
    expect(plan.removed.map((r) => r.id)).toEqual(["m", "l"]);
    expect(plan.pagesAfter).toBe(1);
    expect(plan.kept.experience).toEqual(ids.slice(0, 11));
    expect(plan.exhausted).toBe(false);
  });

  it("只差一点时靠缩放解决，不必删内容", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        measure: fakeMeasure(uniform(ids, 100)),
      })
    );

    // 11 条 = 1100px，缩到 0.962 倍正好一页 —— 一个条目都不用删
    expect(plan.removed).toEqual([]);
    expect(plan.pagesAfter).toBe(1);
  });

  it("按 AI 优先级删 —— 删的是 AI 认为最不相关的那些", async () => {
    const ids = ["a", "b", "c", "d"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        priorityOrder: ["d", "c", "b", "a"],
        measure: fakeMeasure(uniform(ids, 400)),
      })
    );

    // 优先级序列倒序 → 从 a 开始删，删到装得下为止
    expect(plan.removed.map((r) => r.id)).toEqual(["a", "b"]);
    expect(plan.pagesAfter).toBe(1);
  });

  it("每个板块至少留一条 —— 不靠删空板块来省地方", async () => {
    const plan = await planFit(
      base({
        selection: { experience: ["a", "b"], projects: ["c", "d"] },
        entities: entitiesOf(
          entity("a", "experience", 0),
          entity("b", "experience", 1),
          entity("c", "projects", 0),
          entity("d", "projects", 1)
        ),
        measure: fakeMeasure(uniform(["a", "b", "c", "d"], 900)),
      })
    );

    expect(plan.pagesAfter).toBe(2);
    expect(plan.exhausted).toBe(true);
    expect(plan.kept.experience).toHaveLength(1);
    expect(plan.kept.projects).toHaveLength(1);
  });

  it("一页要砍掉一半以上时，改按两页给建议", async () => {
    const ids = ["a", "b", "c"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        measure: fakeMeasure(uniform(ids, 900)),
      })
    );

    // 一页要删 2/3，两页只需删 1/3
    expect(plan.relaxed).toBe(true);
    expect(plan.targetPages).toBe(2);
    expect(plan.removed.map((r) => r.id)).toEqual(["c"]);
    expect(plan.pagesAfter).toBe(2);
    expect(plan.exhausted).toBe(false);
  });

  it("刚好一半不算「一半以上」—— 仍然按一页给", async () => {
    const ids = ["a", "b", "c", "d"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        // 400px 是关键值：4 条恰好删 2 条到一页，也就是正好一半
        measure: fakeMeasure(uniform(ids, 400)),
      })
    );

    expect(plan.relaxed).toBe(false);
    expect(plan.targetPages).toBe(1);
    expect(plan.removed).toHaveLength(2);
  });

  it("把 AI 理由一并带出来，供提议界面逐条展示", async () => {
    const ids = ["a", "b", "c"];
    const plan = await planFit(
      base({
        selection: { experience: ids },
        entities: entitiesOf(...ids.map((id, i) => entity(id, "experience", i))),
        measure: fakeMeasure(uniform(ids, 400)),
        reasons: { c: "与岗位要求无关" },
      })
    );

    expect(plan.removed[0]).toMatchObject({ id: "c", reason: "与岗位要求无关" });
  });

  it("不修改传入的 selection", async () => {
    const selection = { experience: ["a", "b", "c", "d"] };
    await planFit(
      base({
        selection,
        entities: entitiesOf(...selection.experience.map((id, i) => entity(id, "experience", i))),
        measure: fakeMeasure(uniform(selection.experience, 900)),
      })
    );

    expect(selection.experience).toEqual(["a", "b", "c", "d"]);
  });
});
