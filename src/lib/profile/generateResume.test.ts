import { describe, expect, it } from "vitest";
import type { CareerProfile, ProfileEntity } from "@/types/profile";
import type { BasicInfo } from "@/types/resume";
import type { JobTarget } from "@/types/jobTarget";
import { DEFAULT_TEMPLATES } from "@/config";
import { generateResume, selectAllEntities } from "./generateResume";

const NOW = "2026-01-01T00:00:00.000Z";

const basic: BasicInfo = {
  name: "张三",
  title: "",
  email: "a@b.com",
  phone: "138",
  location: "北京",
  birthDate: "1995.01",
  employementStatus: "",
  photo: "",
  photoConfig: {
    width: 90,
    height: 120,
      borderRadius: "none",
    customBorderRadius: 0,
  },
  icons: {},
  customFields: [],
  githubKey: "",
  githubUseName: "",
  githubContributionsVisible: false,
};

const entity = (
  id: string,
  sectionId: string,
  over: Partial<ProfileEntity> = {}
): ProfileEntity => ({
  id,
  type: "custom",
  sectionId,
  title: id,
  subtitle: "",
  dateRange: "",
  description: "",
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const profile = (over: Partial<CareerProfile> = {}): CareerProfile => ({
  version: 1,
  basic,
  entities: {},
  sectionOrder: [],
  skillGroups: [],
  certificateText: "",
  languageText: "",
  selfEvaluationContent: "",
  meta: { createdAt: NOW, updatedAt: NOW, lastBackupAt: null },
  ...over,
});

const target = (over: Partial<JobTarget> = {}): JobTarget => ({
  id: "t1",
  company: "星图智能",
  position: "高级前端工程师",
  jdRaw: "岗位职责：……\n任职要求：……",
  analysesByUser: {},
  cachesByUser: {},
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

/** 测试里不需要真的翻译，直接把 key 当标题用 */
const tSection = (key: string) => key;

const run = (over: Partial<Parameters<typeof generateResume>[0]> = {}) =>
  generateResume({
    profile: profile(),
    mode: "generic",
    templateId: "classic",
    id: "r1",
    title: "测试简历",
    now: NOW,
    selection: {},
    tSection,
    certificateLabel: "证书奖项",
languageLabel: "语言能力",
    ...over,
  });

describe("selectAllEntities", () => {
  it("按板块归类全部可见条目", () => {
    const p = profile({
      entities: {
        e1: entity("e1", "education"),
        e2: entity("e2", "experience"),
        e3: entity("e3", "experience"),
      },
    });

    expect(selectAllEntities(p)).toEqual({
      education: ["e1"],
      experience: ["e2", "e3"],
    });
  });

  it("跳过隐藏条目 —— 它们不该进简历", () => {
    const p = profile({
      entities: {
        e1: entity("e1", "education"),
        e2: entity("e2", "education", { hidden: true }),
      },
    });

    expect(selectAllEntities(p)).toEqual({ education: ["e1"] });
  });
});

describe("generateResume — 快照", () => {
  it("通用简历：mode=generic，无关联投递目标", () => {
    const resume = run({ mode: "generic" });

    expect(resume.snapshot?.mode).toBe("generic");
    expect(resume.snapshot?.jobTargetId).toBeNull();
    expect(resume.snapshot?.generatedAt).toBe(NOW);
  });

  it("岗位专用简历：带上投递目标与 JD 快照", () => {
    const t = target();
    const resume = run({ mode: "targeted", target: t });

    expect(resume.snapshot?.mode).toBe("targeted");
    expect(resume.snapshot?.jobTargetId).toBe("t1");
    expect(resume.snapshot?.jdSnapshot).toBe(t.jdRaw);
  });

  it("专用模式但没传投递目标时退回通用语义，不产出半截快照", () => {
    const resume = run({ mode: "targeted", target: null });

    expect(resume.snapshot?.mode).toBe("generic");
    expect(resume.snapshot?.jobTargetId).toBeNull();
  });
});

describe("generateResume — 板块内容门控", () => {
  const sectionEnabled = (resume: ReturnType<typeof run>, id: string) =>
    resume.menuSections.find((s) => s.id === id)?.enabled;

  it("完全没有内容的可选板块不渲染（否则模板会输出空标题）", () => {
    const resume = run();

    expect(sectionEnabled(resume, "basic")).toBe(true);
    expect(sectionEnabled(resume, "projects")).toBe(false);
    expect(sectionEnabled(resume, "campus")).toBe(false);
    expect(sectionEnabled(resume, "selfEvaluation")).toBe(false);
  });

  it("选中了条目的板块才渲染", () => {
    const resume = run({
      profile: profile({ entities: { e1: entity("e1", "projects") } }),
      selection: { projects: ["e1"] },
    });

    expect(sectionEnabled(resume, "projects")).toBe(true);
  });

  it("只有证书、没有技能组时，技能板块仍要出现", () => {
    const resume = run({ profile: profile({ certificateText: "CET-6" }) });

    expect(sectionEnabled(resume, "skills")).toBe(true);
    expect(resume.skillContent).toContain("CET-6");
  });

  it("技能与证书都为空时技能板块隐藏", () => {
    expect(sectionEnabled(run(), "skills")).toBe(false);
  });

  it("disabledSections 能关掉可选板块，但关不掉必备板块", () => {
    const p = profile({ entities: { e1: entity("e1", "projects") } });
    const resume = run({
      profile: p,
      selection: { projects: ["e1"] },
      disabledSections: new Set(["projects", "basic"]),
    });

    expect(sectionEnabled(resume, "projects")).toBe(false);
    expect(sectionEnabled(resume, "basic")).toBe(true);
  });
});

describe("generateResume — 模板排版参数", () => {
  it("把所选模板的主题色与间距写进 globalSettings", () => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === "timeline")!;
    const resume = run({ templateId: "timeline" });

    expect(resume.globalSettings.themeColor).toBe(template.colorScheme.primary);
    expect(resume.globalSettings.sectionSpacing).toBe(template.spacing.sectionGap);
    expect(resume.globalSettings.paragraphSpacing).toBe(template.spacing.itemGap);
    expect(resume.globalSettings.pagePadding).toBe(template.spacing.contentPadding);
  });

  it("模板的姓名区布局被写到 basic.layout", () => {
    const template = DEFAULT_TEMPLATES.find((t) => t.id === "classic")!;
    expect(run({ templateId: "classic" }).basic.layout).toBe(template.basic.layout);
  });

  it("模板不存在时保留默认排版，不抛错", () => {
    const resume = run({ templateId: "不存在的模板" });

    expect(resume.globalSettings.themeColor).toBeDefined();
    expect(resume.templateId).toBe("不存在的模板");
  });
});

describe("generateResume — 页数预算的接入", () => {
  it("生成时默认开启 autoOnePage —— 不显式打开，第 1 步的自动缩放永远不会发生", () => {
    expect(run().globalSettings.autoOnePage).toBe(true);
  });

  it("模板自带排版参数时也不会把 autoOnePage 覆盖掉", () => {
    const resume = run({ templateId: "timeline" });
    expect(resume.globalSettings.autoOnePage).toBe(true);
    expect(resume.globalSettings.themeColor).toBe(
      DEFAULT_TEMPLATES.find((t) => t.id === "timeline")!.colorScheme.primary
    );
  });
});

describe("generateResume — AI 优先级进入简历", () => {
  const twoExperiences = () =>
    profile({
      entities: {
        a: entity("a", "experience", { order: 0, title: "甲" }),
        b: entity("b", "experience", { order: 1, title: "乙" }),
      },
    });

  const analysis = (rankedIds: string[]) => ({
    items: {},
    rankedIds,
    topN: 5,
    summary: { recommendedCount: 0, coverage: { covered: [], weak: [], missing: [] }, advice: "" },
    modelId: "test",
    promptVersion: "test",
    analyzedAt: NOW,
  });

  it("岗位专用简历按 AI 序列排板块内部顺序", () => {
    const resume = run({
      profile: twoExperiences(),
      mode: "targeted",
      target: target(),
      targetAnalysis: analysis(["b", "a"]) as never,
      selection: { experience: ["a", "b"] },
    });
    expect(resume.experience.map((e) => e.company)).toEqual(["乙", "甲"]);
  });

  it("没有匹配结果时退回数据库顺序", () => {
    const resume = run({
      profile: twoExperiences(),
      mode: "targeted",
      target: target(),
      selection: { experience: ["a", "b"] },
    });
    expect(resume.experience.map((e) => e.company)).toEqual(["甲", "乙"]);
  });

  it("通用简历没有序列可依，同样退回数据库顺序", () => {
    const resume = run({ profile: twoExperiences(), selection: { experience: ["a", "b"] } });
    expect(resume.experience.map((e) => e.company)).toEqual(["甲", "乙"]);
  });
});

describe("generateResume — 纯函数", () => {
  it("同一输入两次调用结果逐字节一致", () => {
    const input = {
      profile: profile({
        entities: { e1: entity("e1", "experience"), e2: entity("e2", "education") },
        skillGroups: [{ id: "g1", name: "语言", content: "英语", order: 0 }],
        certificateText: "CET-6",
      }),
      mode: "targeted" as const,
      target: target(),
      templateId: "modern",
      id: "r1",
      title: "标题",
      now: NOW,
      selection: { experience: ["e1"], education: ["e2"] },
      tSection,
      certificateLabel: "证书奖项",
languageLabel: "语言能力",
    };

    expect(JSON.stringify(generateResume(input))).toBe(
      JSON.stringify(generateResume(input))
    );
  });

  it("不修改传入的数据库对象", () => {
    const p = profile({ entities: { e1: entity("e1", "education") } });
    const snapshot = JSON.stringify(p);

    run({ profile: p, selection: { education: ["e1"] } });

    expect(JSON.stringify(p)).toBe(snapshot);
  });
});
