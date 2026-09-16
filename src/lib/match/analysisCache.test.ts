import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import {
  buildEntityFingerprints,
  checkCache,
  createAnalysisCache,
  diffEntityFingerprints,
  fingerprintContent,
  fingerprintEntity,
} from "./analysisCache";

const entity = (id: string, over: Partial<ProfileEntity> = {}): ProfileEntity => ({
  id,
  type: "experience",
  sectionId: "experience",
  title: `标题-${id}`,
  subtitle: "职位",
  dateRange: "2021.07 - 2024.12",
  description: "<p>描述</p>",
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("fingerprintEntity", () => {
  it("相同内容产生相同指纹", () => {
    expect(fingerprintEntity(entity("a"))).toBe(fingerprintEntity(entity("a")));
  });

  it("内容变化则指纹变化", () => {
    const base = fingerprintEntity(entity("a"));
    for (const patch of [
      { title: "改标题" },
      { description: "<p>改描述</p>" },
      { dateRange: "2020.01 - 2021.01" },
      { tags: ["金融"] },
      { skills: ["React"] },
      { metrics: ["提升 50%"] },
      { hidden: true },
    ]) {
      expect(fingerprintEntity(entity("a", patch)), JSON.stringify(patch)).not.toBe(base);
    }
  });

  it("order 与 updatedAt 不影响指纹", () => {
    const base = fingerprintEntity(entity("a"));
    expect(fingerprintEntity(entity("a", { order: 99 }))).toBe(base);
    expect(fingerprintEntity(entity("a", { updatedAt: "2099-01-01" }))).toBe(base);
  });

  it("tags 的顺序敏感（[金融, 计算机] ≠ [计算机, 金融]）", () => {
    expect(fingerprintEntity(entity("a", { tags: ["金融", "计算机"] }))).not.toBe(
      fingerprintEntity(entity("a", { tags: ["计算机", "金融"] }))
    );
  });
});

describe("fingerprintContent", () => {
  it("条目顺序不影响整体指纹", () => {
    const f1 = { a: "x", b: "y" };
    const f2 = { b: "y", a: "x" };
    expect(fingerprintContent(f1, "jd")).toBe(fingerprintContent(f2, "jd"));
  });

  it("JD 变化则整体指纹变化", () => {
    const f = { a: "x" };
    expect(fingerprintContent(f, "jd1")).not.toBe(fingerprintContent(f, "jd2"));
  });

  it("JD 首尾空白不影响指纹", () => {
    const f = { a: "x" };
    expect(fingerprintContent(f, "  jd  ")).toBe(fingerprintContent(f, "jd"));
  });

  it("条目增删则整体指纹变化", () => {
    expect(fingerprintContent({ a: "x" }, "jd")).not.toBe(
      fingerprintContent({ a: "x", b: "y" }, "jd")
    );
  });
});

describe("diffEntityFingerprints", () => {
  it("识别新增 / 修改 / 删除", () => {
    const prev = { a: "1", b: "2", c: "3" };
    const next = { a: "1", b: "CHANGED", d: "4" };
    expect(diffEntityFingerprints(prev, next)).toEqual({
      added: ["d"],
      modified: ["b"],
      removed: ["c"],
    });
  });

  it("无变化时返回三个空数组", () => {
    const f = { a: "1" };
    expect(diffEntityFingerprints(f, { ...f })).toEqual({
      added: [],
      modified: [],
      removed: [],
    });
  });
});

describe("checkCache", () => {
  const entities = [entity("a"), entity("b")];
  const jdRaw = "岗位职责：负责前端开发";
  const current = {
    entityFingerprints: buildEntityFingerprints(entities),
    jdRaw,
    modelId: "deepseek-chat",
  };

  it("无缓存时不可复用", () => {
    expect(checkCache(null, current)).toMatchObject({ reusable: false, reason: "no_cache" });
  });

  it("数据未变时可复用 —— 这是「结果零变化」的基础", () => {
    const cache = createAnalysisCache({
      ...current,
      analyzedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(checkCache(cache, current)).toEqual({ reusable: true });
  });

  it("条目内容变化时不可复用，并给出变更明细", () => {
    const cache = createAnalysisCache({ ...current, analyzedAt: "" });
    const changed = {
      ...current,
      entityFingerprints: buildEntityFingerprints([entity("a", { title: "改了" }), entity("b")]),
    };

    const verdict = checkCache(cache, changed);
    expect(verdict.reusable).toBe(false);
    expect(verdict.reason).toBe("content_changed");
    expect(verdict.changes).toEqual({ added: [], modified: ["a"], removed: [] });
  });

  it("JD 变化时不可复用", () => {
    const cache = createAnalysisCache({ ...current, analyzedAt: "" });
    expect(checkCache(cache, { ...current, jdRaw: "另一个 JD" })).toMatchObject({
      reusable: false,
      reason: "content_changed",
    });
  });

  it("换模型时不可复用", () => {
    const cache = createAnalysisCache({ ...current, analyzedAt: "" });
    expect(checkCache(cache, { ...current, modelId: "doubao" })).toMatchObject({
      reusable: false,
      reason: "model_changed",
    });
  });

  it("提示词版本变化时不可复用", () => {
    const cache = { ...createAnalysisCache({ ...current, analyzedAt: "" }), promptVersion: "v0" };
    expect(checkCache(cache, current)).toMatchObject({
      reusable: false,
      reason: "prompt_changed",
    });
  });

  it("恢复被改动的条目后指纹回到原值，缓存重新可用", () => {
    const original = buildEntityFingerprints(entities);
    const cache = createAnalysisCache({ ...current, analyzedAt: "" });

    const changed = {
      ...current,
      entityFingerprints: buildEntityFingerprints([entity("a", { title: "改了" }), entity("b")]),
    };
    expect(checkCache(cache, changed).reusable).toBe(false);

    expect(checkCache(cache, { ...current, entityFingerprints: original }).reusable).toBe(true);
  });
});
