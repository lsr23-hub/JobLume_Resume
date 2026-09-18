import { describe, expect, it } from "vitest";
import { lintCases, listCaseFiles, loadAllCases } from "./index";

/**
 * 数据集自身的体检。
 *
 * 这里挂了说明**标注有问题**，不是代码有问题 —— 先修数据再跑评测。
 * 数据集有洞的话，跑出来的指标是假的。
 */
describe("评测数据集", () => {
  const cases = loadAllCases();

  it("能全部加载，且每条可见经历都有标注", () => {
    expect(cases.length).toBe(listCaseFiles().length);
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it("level 与 idealSelection 由相关度派生，不会再自相矛盾", () => {
    for (const c of cases) {
      for (const g of Object.values(c.gold.entities)) {
        expect(g.level).toBe(g.relevance >= 2 ? "recommended" : "not_recommended");
      }
      for (const id of c.gold.idealSelection) {
        expect(c.gold.entities[id].relevance).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("预算线划在干净的地方，没有并列跨线", () => {
    const issues = lintCases(cases);
    expect(issues.map((i) => `${i.caseId}: ${i.message}`).join("\n")).toBe("");
  });

  it("每个案例都有区分度：既有推荐也有不推荐", () => {
    for (const c of cases) {
      const levels = Object.values(c.gold.entities).map((g) => g.level);
      expect(levels, `${c.id} 全是同一档，测不出判定质量`).toContain("recommended");
      expect(levels, `${c.id} 全是同一档，测不出判定质量`).toContain("not_recommended");
    }
  });

  it("相关性有梯度，不能只有 0 和 3", () => {
    // 只有两端的话，NDCG 和排序指标退化成二值问题，测不出排序质量
    const all = cases.flatMap((c) => Object.values(c.gold.entities).map((g) => g.relevance));
    expect(new Set(all).size).toBeGreaterThanOrEqual(3);
  });

  it("覆盖了设计里要求的全部维度", () => {
    const dims = new Set(cases.flatMap((c) => c.dimensions));
    ["强匹配", "弱匹配", "触发取舍", "不触发取舍", "干扰项", "跨领域"].forEach((d) => {
      expect(dims, `缺少维度：${d}`).toContain(d);
    });
  });
});
