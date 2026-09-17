import { describe, expect, it } from "vitest";
import type { ProfileEntity } from "@/types/profile";
import {
  entityToCustomItem,
  entityToEducation,
  entityToExperience,
  entityToProject,
} from "./toResumeItem";

const entity = (over: Partial<ProfileEntity> = {}): ProfileEntity => ({
  id: "e1",
  type: "custom",
  sectionId: "education",
  title: "清华大学",
  subtitle: "计算机科学与技术",
  dateRange: "2018/09 - 2021/06",
  description: "<p>描述</p>",
  tags: [],
  skills: [],
  metrics: [],
  order: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("entityToEducation", () => {
  it("把起止时间拆成模板要的两个字段", () => {
    const edu = entityToEducation(entity({ dateRange: "2018/09 - 2021/06" }));
    expect(edu.startDate).toBe("2018/09");
    expect(edu.endDate).toBe("2021/06");
  });

  it("degree / gpa 缺失时给空串而不是 undefined", () => {
    // 模板直接渲染这两个字段，undefined 会显示成 "undefined"
    const edu = entityToEducation(entity());
    expect(edu.degree).toBe("");
    expect(edu.gpa).toBe("");
  });

  it('"至今" 不被当成结束时间', () => {
    const edu = entityToEducation(entity({ dateRange: "2018/09 - 至今" }));
    expect(edu.startDate).toBe("2018/09");
    expect(edu.endDate).not.toBe("2018/09");
  });

  it("id 沿用条目 id —— 编辑器据此判断「这条已经在简历里了」", () => {
    expect(entityToEducation(entity({ id: "abc" })).id).toBe("abc");
  });

  it("新加入的条目默认可见", () => {
    expect(entityToEducation(entity()).visible).toBe(true);
  });
});

describe("entityToExperience", () => {
  it("日期整段透传，不拆分", () => {
    // 工作经历的模板渲染的是原始字符串
    expect(entityToExperience(entity({ dateRange: "2022/04 - 至今" })).date).toBe(
      "2022/04 - 至今"
    );
  });

  it("title → company，subtitle → position，description → details", () => {
    const exp = entityToExperience(
      entity({ title: "蚂蚁集团", subtitle: "风控算法工程师", description: "<p>职责</p>" })
    );
    expect(exp).toMatchObject({
      company: "蚂蚁集团",
      position: "风控算法工程师",
      details: "<p>职责</p>",
      visible: true,
    });
  });
});

describe("entityToProject", () => {
  it("带上链接字段", () => {
    const project = entityToProject(
      entity({ link: "https://example.com", linkLabel: "项目主页" })
    );
    expect(project.link).toBe("https://example.com");
    expect(project.linkLabel).toBe("项目主页");
  });

  it("没有链接时留空", () => {
    const project = entityToProject(entity());
    expect(project.link).toBeUndefined();
    expect(project.linkLabel).toBeUndefined();
  });
});

describe("entityToCustomItem", () => {
  it("校园经历 / 荣誉 / 语言走的是字段直传", () => {
    const item = entityToCustomItem(
      entity({ sectionId: "campus", title: "研究生会", subtitle: "技术部部长" })
    );
    expect(item).toMatchObject({
      title: "研究生会",
      subtitle: "技术部部长",
      dateRange: "2018/09 - 2021/06",
      visible: true,
    });
  });
});
