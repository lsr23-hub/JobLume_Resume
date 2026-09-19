import { describe, expect, it } from "vitest";
import {
  LEGACY_USER_ID,
  analysisFor,
  cacheFor,
  migrateProfileState,
  migrateResumeState,
  migrateTargetState,
  normalizeProfileState,
  normalizeResumeState,
  normalizeTargetState,
  withAnalysisFor,
  withoutUserAnalyses,
} from "./userScope";
import type { CareerProfile } from "@/types/profile";
import type { ResumeData } from "@/types/resume";
import type { AnalysisCache, JobTarget, MatchAnalysis } from "@/types/jobTarget";

const profile = (name: string): CareerProfile =>
  ({
    version: 1,
    basic: { name, customFields: [] },
    entities: {},
    sectionOrder: [],
    skillGroups: [],
    certificateText: "",
    languageText: "",
    selfEvaluationContent: "",
    meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01", lastBackupAt: null },
  }) as unknown as CareerProfile;

/** 一个字都没有的档案 —— ensureProfile 首次访问时写下的就是这种 */
const emptyProfile = (): CareerProfile => ({
  ...profile(""),
  meta: { createdAt: "2026-01-01", updatedAt: "2026-01-01", lastBackupAt: null },
});

const resume = (id: string) => ({ id, title: id } as unknown as ResumeData);

const analysis = (modelId: string) =>
  ({ items: {}, rankedIds: [], topN: 5, summary: {}, modelId }) as unknown as MatchAnalysis;
const cache = (fp: string) => ({ contentFingerprint: fp }) as unknown as AnalysisCache;

const target = (id: string, over: Partial<Record<string, unknown>> = {}) =>
  ({ id, company: "示例", position: "前端", jdRaw: "JD", createdAt: "t", updatedAt: "t", ...over }) as unknown as JobTarget;

describe("职业档案迁移 0 → 1", () => {
  it("有内容的档案归到 LEGACY_USER_ID 名下并设为当前用户", () => {
    const out = migrateProfileState({ profile: profile("张三") }, 0);
    expect(out.currentUserId).toBe(LEGACY_USER_ID);
    expect(out.profiles[LEGACY_USER_ID].basic.name).toBe("张三");
  });

  it("profile 为 null → 空列表 + 未选用户（触发选择弹窗）", () => {
    expect(migrateProfileState({ profile: null }, 0)).toEqual({ profiles: {}, currentUserId: null });
  });

  it("**空档案不进用户列表** —— 否则老用户永远看不到选择弹窗", () => {
    expect(migrateProfileState({ profile: emptyProfile() }, 0)).toEqual({
      profiles: {},
      currentUserId: null,
    });
  });

  it("形状无法识别时抛错，而不是返回空结构（抛错不写盘，返回空结构会写盘）", () => {
    expect(() => migrateProfileState({ profile: "字符串" }, 0)).toThrow();
  });

  it("未知版本抛错", () => {
    expect(() => migrateProfileState({}, 7)).toThrow();
  });

  it("缺字段的 blob 走 normalize（版本字段缺失时 persist 根本不调 migrate）", () => {
    expect(normalizeProfileState({ profile: profile("李四") }).currentUserId).toBe(LEGACY_USER_ID);
    expect(normalizeProfileState(undefined)).toEqual({ profiles: {}, currentUserId: null });
    expect(normalizeProfileState("乱七八糟")).toEqual({ profiles: {}, currentUserId: null });
  });

  it("已是新形状则原样保留，当前用户指向不存在的档案时回落为 null", () => {
    const state = { profiles: { u1: profile("A") }, currentUserId: "u1" };
    expect(normalizeProfileState(state)).toEqual(state);
    expect(normalizeProfileState({ ...state, currentUserId: "u9" }).currentUserId).toBeNull();
  });
});

describe("简历迁移 0 → 1", () => {
  it("扁平 resumes 整体挂到 LEGACY_USER_ID 下", () => {
    const out = migrateResumeState({ resumes: { r1: resume("r1") }, activeResumeId: "r1" }, 0);
    expect(Object.keys(out.byUser[LEGACY_USER_ID])).toEqual(["r1"]);
    expect(out.activeByUser[LEGACY_USER_ID]).toBe("r1");
  });

  it("空库 → 空结构", () => {
    expect(migrateResumeState({ resumes: {}, activeResumeId: null }, 0)).toEqual({
      byUser: {},
      activeByUser: {},
    });
  });

  it("activeResumeId 指向不存在的简历时置空", () => {
    const out = migrateResumeState({ resumes: { r1: resume("r1") }, activeResumeId: "nope" }, 0);
    expect(out.activeByUser[LEGACY_USER_ID]).toBeNull();
  });

  it("drop 掉形状不对的条目，保住其余", () => {
    const out = migrateResumeState({ resumes: { r1: resume("r1"), bad: 42 } }, 0);
    expect(Object.keys(out.byUser[LEGACY_USER_ID])).toEqual(["r1"]);
  });

  it("normalize 对已是新形状的数据做同样的裁剪", () => {
    const out = normalizeResumeState({
      byUser: { u1: { r1: resume("r1"), bad: 1 }, u2: "不是对象" },
      activeByUser: { u1: "r1" },
    });
    expect(Object.keys(out.byUser)).toEqual(["u1"]);
    expect(out.activeByUser.u1).toBe("r1");
  });
});

describe("投递目标迁移 0 → 1", () => {
  it("单槽分析挪进 LEGACY_USER_ID 名下，岗位本身不动", () => {
    const out = migrateTargetState(
      { targets: { t1: target("t1", { matchAnalysis: analysis("m1"), analysisCache: cache("fp1") }) } },
      0
    );
    expect(out.t1.company).toBe("示例");
    expect(out.t1.analysesByUser[LEGACY_USER_ID].modelId).toBe("m1");
    expect(out.t1.cachesByUser[LEGACY_USER_ID].contentFingerprint).toBe("fp1");
  });

  it("没分析过的岗位得到两个空表，不是 undefined", () => {
    const out = migrateTargetState({ targets: { t1: target("t1") } }, 0);
    expect(out.t1.analysesByUser).toEqual({});
    expect(out.t1.cachesByUser).toEqual({});
  });

  it("幂等：已迁移过的目标重复跑不丢分析", () => {
    const once = migrateTargetState(
      { targets: { t1: target("t1", { matchAnalysis: analysis("m1") }) } },
      0
    );
    const twice = normalizeTargetState({ targets: once });
    expect(twice.t1.analysesByUser[LEGACY_USER_ID].modelId).toBe("m1");
  });

  it("形状不认识的输入回落到空表而不是抛错", () => {
    expect(normalizeTargetState({ targets: { t1: { id: "t1" } } }).t1.analysesByUser).toEqual({});
    expect(normalizeTargetState("乱七八糟")).toEqual({});
  });
});

describe("按用户读写分析", () => {
  const base = migrateTargetState({ targets: { t1: target("t1") } }, 0).t1;

  it("analysisFor / cacheFor 取的是指定用户那一份", () => {
    const withA = withAnalysisFor(base, "ua", analysis("ma"), cache("fa"));
    expect(analysisFor(withA, "ua")?.modelId).toBe("ma");
    expect(analysisFor(withA, "ub")).toBeNull();
    expect(cacheFor(withA, "ua")?.contentFingerprint).toBe("fa");
  });

  it("未选用户时返回 null，不误读别人的分析", () => {
    const withA = withAnalysisFor(base, "ua", analysis("ma"), cache("fa"));
    expect(analysisFor(withA, null)).toBeNull();
    expect(cacheFor(undefined, "ua")).toBeNull();
  });

  it("两个用户各存一份，互不覆盖 —— 这正是决策 2 要的效果", () => {
    const both = withAnalysisFor(
      withAnalysisFor(base, "ua", analysis("ma"), cache("fa")),
      "ub",
      analysis("mb"),
      cache("fb")
    );
    expect(analysisFor(both, "ua")?.modelId).toBe("ma");
    expect(analysisFor(both, "ub")?.modelId).toBe("mb");
  });

  it("写用户不就地改原对象", () => {
    const next = withAnalysisFor(base, "ua", analysis("ma"), cache("fa"));
    expect(base.analysesByUser).toEqual({});
    expect(next).not.toBe(base);
  });

  it("删用户时连带清掉他在每一条岗位上的分析", () => {
    const both = withAnalysisFor(
      withAnalysisFor(base, "ua", analysis("ma"), cache("fa")),
      "ub",
      analysis("mb"),
      cache("fb")
    );
    const after = withoutUserAnalyses(both, "ua");
    expect(analysisFor(after, "ua")).toBeNull();
    expect(analysisFor(after, "ub")?.modelId).toBe("mb");
  });
});
