import { describe, expect, it } from "vitest";
import {
  LEGACY_USER_ID,
  migrateProfileState,
  migrateResumeState,
  migrateTargetStateV2,
  normalizeImportedTarget,
  normalizeProfileState,
  normalizeResumeState,
  normalizeTargetStateV2,
  targetsOf,
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

describe("投递目标迁移 v1 → v2：岗位本身按用户隔离（扇出）", () => {
  const v1Targets = (over: Record<string, unknown> = {}) => ({
    targets: {
      t1: {
        ...target("t1"),
        analysesByUser: { ua: analysis("ma"), ub: analysis("mb") },
        cachesByUser: { ua: cache("fa"), ub: cache("fb") },
        ...over,
      },
    },
  });

  it("一条岗位挂多个用户的分析 → 拆成每人一份各自的副本", () => {
    const out = migrateTargetStateV2(v1Targets(), 1).targetsByUser;
    expect(Object.keys(out).sort()).toEqual(["ua", "ub"]);
    expect(out.ua.t1.matchAnalysis?.modelId).toBe("ma");
    expect(out.ub.t1.matchAnalysis?.modelId).toBe("mb");
    // 岗位本身的字段每人一份，且公司名不丢
    expect(out.ua.t1.company).toBe("示例");
    expect(out.ub.t1.company).toBe("示例");
  });

  it("v2 的副本不再带 analysesByUser —— 单槽就够", () => {
    const out = migrateTargetStateV2(v1Targets(), 1).targetsByUser;
    expect("analysesByUser" in out.ua.t1).toBe(false);
    expect("cachesByUser" in out.ua.t1).toBe(false);
  });

  it("**从没人分析过的岗位归到 LEGACY_USER_ID**，分析槽为空", () => {
    const out = migrateTargetStateV2(
      { targets: { t1: { ...target("t1"), analysesByUser: {}, cachesByUser: {} } } },
      1
    ).targetsByUser;
    expect(Object.keys(out)).toEqual([LEGACY_USER_ID]);
    expect(out[LEGACY_USER_ID].t1.matchAnalysis).toBeNull();
    expect(out[LEGACY_USER_ID].t1.analysisCache).toBeNull();
  });

  it("v0（从未迁移过）走同一条路：先 v0→v1 再扇出", () => {
    const out = migrateTargetStateV2(
      { targets: { t1: target("t1", { matchAnalysis: analysis("m0"), analysisCache: cache("f0") }) } },
      0
    ).targetsByUser;
    expect(out[LEGACY_USER_ID].t1.matchAnalysis?.modelId).toBe("m0");
  });

  it("未知版本抛错，而不是返回空结构", () => {
    expect(() => migrateTargetStateV2({}, 9)).toThrow();
  });

  it("已经是 v2 时不重复扇出（保数据，不清空）", () => {
    const once = migrateTargetStateV2(v1Targets(), 1);
    const twice = migrateTargetStateV2(once, 2);
    expect(Object.keys(twice.targetsByUser).sort()).toEqual(["ua", "ub"]);
    expect(twice.targetsByUser.ua.t1.matchAnalysis?.modelId).toBe("ma");
  });

  it("normalize 对已是 v2 的形状做同样的裁剪，坏条目丢掉", () => {
    const out = normalizeTargetStateV2({
      targetsByUser: { ua: { t1: { ...target("t1"), matchAnalysis: analysis("ma") }, bad: 42 } },
    });
    expect(Object.keys(out.targetsByUser.ua)).toEqual(["t1"]);
    // 形状不对的分析槽回落成 null，而不是把坏对象透传下去
    expect(out.targetsByUser.ua.t1.analysisCache).toBeNull();
  });

  it("targetsOf 只取当前用户的岗位；没选用户时给空表", () => {
    const persisted = migrateTargetStateV2(v1Targets(), 1);
    expect(Object.keys(targetsOf(persisted, "ua"))).toEqual(["t1"]);
    expect(targetsOf(persisted, "nobody")).toEqual({});
    expect(targetsOf(persisted, null)).toEqual({});
  });
});

describe("归一化：坏输入不抛错", () => {
  it("migrate 返回的是**切片形状** { targetsByUser }，不是裸 map —— 返回裸 map 会让岗位全消失", () => {
    const out = migrateTargetStateV2({ targets: { t1: target("t1") } }, 0);
    expect(Object.keys(out)).toEqual(["targetsByUser"]);
  });

  it("形状不认识的输入回落到空表而不是抛错", () => {
    expect(normalizeTargetStateV2({ targetsByUser: { ua: { bad: 42 } } }).targetsByUser.ua).toEqual({});
    expect(normalizeTargetStateV2("乱七八糟")).toEqual({ targetsByUser: {} });
    expect(migrateTargetStateV2({ targets: { t1: 42 } }, 0).targetsByUser).toEqual({});
  });

  it("targetsByUser 里混进 v1 的残余字段也会被清掉，只留单槽", () => {
    const out = normalizeTargetStateV2({
      targetsByUser: {
        ua: { t1: { ...target("t1"), analysesByUser: { ub: analysis("别人的") }, matchAnalysis: analysis("ma") } },
      },
    });
    const got = out.targetsByUser.ua.t1;
    expect("analysesByUser" in got).toBe(false);
    expect(got.matchAnalysis?.modelId).toBe("ma");
  });
});

describe("备份文件里的目标：三个时代的形状都要能导进来", () => {
  it("v1（分析按用户索引）→ 只取指定用户那一份", () => {
    const raw = {
      ...target("t1"),
      analysesByUser: { ua: analysis("ma"), ub: analysis("mb") },
      cachesByUser: { ua: cache("fa"), ub: cache("fb") },
    };
    expect(normalizeImportedTarget(raw, "ua")?.matchAnalysis?.modelId).toBe("ma");
    expect(normalizeImportedTarget(raw, "ua")?.analysisCache?.contentFingerprint).toBe("fa");
    // 该用户没有分析时导进来就是「还没分析过」，不顶别人的结论上来
    expect(normalizeImportedTarget(raw, "uc")?.matchAnalysis).toBeNull();
  });

  it("v0（单槽）→ 归属给导入的那个用户", () => {
    const raw = target("t1", { matchAnalysis: analysis("m0"), analysisCache: cache("f0") });
    expect(normalizeImportedTarget(raw, "ua")?.matchAnalysis?.modelId).toBe("m0");
    expect(normalizeImportedTarget(raw, "ua")?.analysisCache?.contentFingerprint).toBe("f0");
  });

  it("v2（单槽）→ 原样，且不留 v1 字段", () => {
    const raw = target("t1", { matchAnalysis: analysis("m2"), analysisCache: null });
    const got = normalizeImportedTarget(raw, "ua")!;
    expect(got.matchAnalysis?.modelId).toBe("m2");
    expect(got.analysisCache).toBeNull();
    expect("analysesByUser" in got).toBe(false);
  });

  it("认不出形状的返回 null，而不是造一条残废岗位", () => {
    expect(normalizeImportedTarget({ company: "没有 id" }, "ua")).toBeNull();
    expect(normalizeImportedTarget("乱七八糟", "ua")).toBeNull();
    expect(normalizeImportedTarget(null, "ua")).toBeNull();
  });
});
