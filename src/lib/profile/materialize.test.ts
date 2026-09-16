import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import type { BasicInfo, MenuSection } from "@/types/resume";
import { initialResumeState } from "@/config/initialResumeData";
import { materialize, renderSkillContent, type MaterializeInput } from "./materialize";

const NOW = "2026-01-01T00:00:00.000Z";

const basic: BasicInfo = {
  name: "张三",
  title: "前端工程师",
  email: "a@b.com",
  phone: "138",
  location: "北京",
  birthDate: "1995.01",
  employementStatus: "在职",
  photo: "",
  photoConfig: {
    width: 90,
    height: 120,
    aspectRatio: "1:1",
    borderRadius: "none",
    customBorderRadius: 0,
  },
  icons: {},
  customFields: [],
  githubKey: "",
  githubUseName: "",
  githubContributionsVisible: false,
};

const entity = (id: string, sectionId: string, over: Partial<ProfileEntity> = {}): ProfileEntity => ({
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
  createdAt: "",
  updatedAt: "",
  ...over,
});

const section = (id: string, order = 0): MenuSection => ({
  id,
  title: id,
  icon: "",
  enabled: true,
  order,
});

const buildInput = (over: Partial<MaterializeInput> = {}): MaterializeInput => ({
  profile: {
    version: 1,
    basic,
    entities: {},
    sectionOrder: [],
    skillGroups: [],
    certificates: [],
    selfEvaluationContent: "",
    meta: { createdAt: NOW, updatedAt: NOW, lastBackupAt: null },
  },
  selection: {},
  sections: [],
  meta: { id: "r1", title: "测试简历", now: NOW, templateId: "classic" },
  ...over,
});

describe("renderSkillContent", () => {
  it("HTML 结构与上游 initialResumeData 一致", () => {
    const profile = buildInput().profile;
    profile.skillGroups = [
      { id: "g1", name: "前端框架", content: "React、Vue.js", order: 0 },
    ];

    expect(renderSkillContent(profile)).toBe(
      `<div class="skill-content">\n  <ul>\n    <li>前端框架：React、Vue.js</li>\n  </ul>\n</div>`
    );
  });

  it("按 order 排序，跳过空内容", () => {
    const profile = buildInput().profile;
    profile.skillGroups = [
      { id: "b", name: "B", content: "b", order: 1 },
      { id: "empty", name: "空", content: "   ", order: 2 },
      { id: "a", name: "A", content: "a", order: 0 },
    ];

    const html = renderSkillContent(profile);
    expect(html.indexOf("A：a")).toBeLessThan(html.indexOf("B：b"));
    expect(html).not.toContain("空");
  });

  it("无技能组时返回空串，而非空壳标签", () => {
    expect(renderSkillContent(buildInput().profile)).toBe("");
  });
});

describe("materialize — 字段映射", () => {
  it("教育经历拆出起止日期并映射字段名", () => {
    const input = buildInput({
      profile: {
        ...buildInput().profile,
        entities: {
          e1: entity("e1", "education", {
            type: "education",
            title: "北京大学",
            subtitle: "计算机",
            dateRange: "2013.09 - 2017.06",
            description: "desc",
            degree: "本科",
            gpa: "3.8",
          }),
        },
      },
      selection: { education: ["e1"] },
      sections: [section("education")],
    });

    const resume = materialize(input);
    expect(resume.education).toEqual([
      {
        id: "e1",
        school: "北京大学",
        major: "计算机",
        degree: "本科",
        startDate: "2013.09",
        endDate: "2017.06",
        gpa: "3.8",
        description: "desc",
        visible: true,
      },
    ]);
  });

  it("经历保留合并的时间字段", () => {
    const input = buildInput({
      profile: {
        ...buildInput().profile,
        entities: {
          e1: entity("e1", "experience", {
            title: "字节跳动",
            subtitle: "高级前端",
            dateRange: "2021.07 - 2024.12",
            description: "details",
          }),
        },
      },
      selection: { experience: ["e1"] },
      sections: [section("experience")],
    });

    expect(materialize(input).experience[0]).toMatchObject({
      company: "字节跳动",
      position: "高级前端",
      date: "2021.07 - 2024.12",
      details: "details",
    });
  });

  it("项目经验带上外链字段", () => {
    const input = buildInput({
      profile: {
        ...buildInput().profile,
        entities: {
          p1: entity("p1", "projects", {
            type: "project",
            title: "组件库",
            subtitle: "负责人",
            link: "https://x.dev",
            linkLabel: "仓库",
          }),
        },
      },
      selection: { projects: ["p1"] },
      sections: [section("projects")],
    });

    expect(materialize(input).projects[0]).toMatchObject({
      name: "组件库",
      role: "负责人",
      link: "https://x.dev",
      linkLabel: "仓库",
    });
  });

  it("校园经历等自定义板块走 customData 通道", () => {
    const input = buildInput({
      profile: {
        ...buildInput().profile,
        entities: {
          c1: entity("c1", "campus", {
            type: "campus",
            title: "学生会",
            subtitle: "部长",
            dateRange: "2015.09 - 2016.06",
          }),
        },
      },
      selection: { campus: ["c1"] },
      sections: [section("campus")],
    });

    expect(materialize(input).customData.campus).toEqual([
      {
        id: "c1",
        title: "学生会",
        subtitle: "部长",
        dateRange: "2015.09 - 2016.06",
        description: "",
        visible: true,
      },
    ]);
  });

  it("内置板块不会重复进入 customData", () => {
    const input = buildInput({
      profile: {
        ...buildInput().profile,
        entities: { e1: entity("e1", "experience", { title: "公司" }) },
      },
      selection: { experience: ["e1"] },
      sections: [section("experience")],
    });

    const resume = materialize(input);
    expect(resume.experience).toHaveLength(1);
    expect(resume.customData).toEqual({});
  });
});

describe("materialize — 选择与过滤", () => {
  it("只产出被选中的条目", () => {
    const profile = buildInput().profile;
    profile.entities = {
      a: entity("a", "experience"),
      b: entity("b", "experience"),
    };

    const resume = materialize(
      buildInput({ profile, selection: { experience: ["a"] }, sections: [section("experience")] })
    );
    expect(resume.experience.map((e) => e.id)).toEqual(["a"]);
  });

  it("板块内按 order 排序", () => {
    const profile = buildInput().profile;
    profile.entities = {
      a: entity("a", "experience", { order: 2 }),
      b: entity("b", "experience", { order: 0 }),
      c: entity("c", "experience", { order: 1 }),
    };

    const resume = materialize(
      buildInput({
        profile,
        selection: { experience: ["a", "b", "c"] },
        sections: [section("experience")],
      })
    );
    expect(resume.experience.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("隐藏的条目不产出，即使被选中", () => {
    const profile = buildInput().profile;
    profile.entities = { a: entity("a", "experience", { hidden: true }) };

    const resume = materialize(
      buildInput({ profile, selection: { experience: ["a"] }, sections: [section("experience")] })
    );
    expect(resume.experience).toEqual([]);
  });

  it("引用了不存在的 id 时不崩溃", () => {
    const resume = materialize(
      buildInput({ selection: { experience: ["ghost"] }, sections: [section("experience")] })
    );
    expect(resume.experience).toEqual([]);
  });

  it("空数据库产出空数组而非 undefined", () => {
    const resume = materialize(buildInput());
    expect(resume.education).toEqual([]);
    expect(resume.experience).toEqual([]);
    expect(resume.projects).toEqual([]);
    expect(resume.customData).toEqual({});
    expect(resume.skillContent).toBe("");
  });
});

describe("materialize — sourceMap 与快照", () => {
  it("每个产出的条目都能在 sourceMap 中找到来源", () => {
    const profile = buildInput().profile;
    profile.entities = {
      e1: entity("e1", "education", { type: "education" }),
      e2: entity("e2", "experience"),
      e3: entity("e3", "projects", { type: "project" }),
      e4: entity("e4", "campus", { type: "campus" }),
    };

    const resume = materialize(
      buildInput({
        profile,
        selection: {
          education: ["e1"],
          experience: ["e2"],
          projects: ["e3"],
          campus: ["e4"],
        },
        sections: [section("education"), section("experience"), section("projects"), section("campus")],
      })
    );

    const producedIds = [
      ...resume.education.map((e) => e.id),
      ...resume.experience.map((e) => e.id),
      ...resume.projects.map((e) => e.id),
      ...Object.values(resume.customData).flat().map((e) => e.id),
    ];

    expect(producedIds).toHaveLength(4);
    for (const id of producedIds) {
      expect(resume.sourceMap?.[id], `sourceMap 缺少 ${id}`).toBe(id);
    }
  });

  it("默认全局设置与上游一致", () => {
    const { globalSettings } = materialize(buildInput());
    expect(globalSettings).toMatchObject({
      baseFontSize: 16,
      pagePadding: 32,
      lineHeight: 1.5,
      themeColor: "#000000",
    });
  });

  it("传入的 globalSettings 覆盖默认值", () => {
    const resume = materialize(buildInput({ globalSettings: { baseFontSize: 20 } }));
    expect(resume.globalSettings?.baseFontSize).toBe(20);
    expect(resume.globalSettings?.pagePadding).toBe(32);
  });

  it("activeSection 落在第一个启用的板块上", () => {
    const resume = materialize(
      buildInput({
        sections: [
          { ...section("basic", 0), enabled: false },
          section("education", 1),
        ],
      })
    );
    expect(resume.activeSection).toBe("education");
  });

  it("快照原样透传", () => {
    const snapshot = {
      mode: "generic" as const,
      jobTargetId: null,
      generatedAt: NOW,
    };
    expect(materialize(buildInput({ snapshot })).snapshot).toEqual(snapshot);
  });

  it("同一输入重复调用产出完全一致", () => {
    const profile = buildInput().profile;
    profile.entities = { a: entity("a", "experience"), b: entity("b", "campus") };
    const input = buildInput({
      profile,
      selection: { experience: ["a"], campus: ["b"] },
      sections: [section("experience"), section("campus")],
    });

    const first = JSON.stringify(materialize(input));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(materialize(input))).toBe(first);
    }
  });
});

describe("materialize — 与上游模板的契约", () => {
  it("产出的字段集合覆盖 initialResumeState 的全部字段", () => {
    // 模板组件直接读这些字段，少一个就是空白或崩溃
    const resume = materialize(buildInput());
    const missing = Object.keys(initialResumeState).filter(
      (key) => !(key in resume) || resume[key as keyof typeof resume] === undefined
    );
    expect(missing, `物化结果缺少上游字段: ${missing.join(", ")}`).toEqual([]);
  });

  it("产出结构与 initialResumeState 的字段类型一致", () => {
    const resume = materialize(buildInput());
    for (const [key, value] of Object.entries(initialResumeState)) {
      const produced = resume[key as keyof typeof resume];
      if (Array.isArray(value)) {
        expect(Array.isArray(produced), `${key} 应为数组`).toBe(true);
      } else if (value !== null && typeof value === "object") {
        expect(typeof produced, `${key} 应为对象`).toBe("object");
      } else {
        expect(typeof produced, `${key} 类型不符`).toBe(typeof value);
      }
    }
  });
});
