import { describe, expect, it } from "vitest";
import { profileImportFromAiResult, toListHtml, toStringArray } from "./importFromAi";

/**
 * PDF 导入的映射。
 *
 * 这条路径原来直接造一份**简历**，现在改成落到**职业数据库** ——
 * 测的重点是「抽到的东西有没有丢」以及「没抽到的东西有没有被凭空造出来」。
 */

const opts = { skillGroupName: "技能" };

describe("profileImportFromAiResult —— 教育经历", () => {
  it("起止两栏合成区间，学校进 title、专业进 subtitle", () => {
    const { entities } = profileImportFromAiResult(
      {
        education: [
          { school: "清华大学", major: "计算机科学与技术", degree: "硕士", startDate: "2020.09", endDate: "2023.06", gpa: "3.8/4.0", description: ["一等学业奖学金", "GPA 专业前 5%"] },
        ],
      },
      opts
    );
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      type: "education",
      sectionId: "education",
      title: "清华大学",
      subtitle: "计算机科学与技术",
      degree: "硕士",
      gpa: "3.8/4.0",
      dateRange: "2020.09 - 2023.06",
    });
    expect(entities[0].description).toBe(
      "<ul><li>一等学业奖学金</li><li>GPA 专业前 5%</li></ul>"
    );
  });

  it("只有起始时间时不拼出多余的分隔符", () => {
    const { entities } = profileImportFromAiResult(
      { education: [{ school: "北大", startDate: "2016.09" }] },
      opts
    );
    expect(entities[0].dateRange).toBe("2016.09");
  });
});

describe("profileImportFromAiResult —— 工作与项目", () => {
  it("公司进 title、职位进 subtitle、details 进描述", () => {
    const { entities } = profileImportFromAiResult(
      { experience: [{ company: "字节跳动", position: "前端工程师", date: "2022.03 - 至今", details: ["主导搭建平台", "首屏 LCP 从 3.4s 降到 1.2s"] }] },
      opts
    );
    expect(entities[0]).toMatchObject({
      type: "experience",
      sectionId: "experience",
      title: "字节跳动",
      subtitle: "前端工程师",
      dateRange: "2022.03 - 至今",
    });
    expect(entities[0].description).toContain("首屏 LCP");
  });

  it("项目的外链单独带过来", () => {
    const { entities } = profileImportFromAiResult(
      { projects: [{ name: "组件库", role: "核心贡献者", date: "2022.04 - 2022.12", link: "https://github.com/x/y", linkLabel: "GitHub" }] },
      opts
    );
    expect(entities[0]).toMatchObject({
      type: "project",
      sectionId: "projects",
      title: "组件库",
      link: "https://github.com/x/y",
      linkLabel: "GitHub",
    });
  });

  it("整条都空的条目不产出 —— 空条目会污染板块还会拖累排序", () => {
    const { entities } = profileImportFromAiResult(
      { experience: [{ company: "", position: "" }, { company: "有内容的公司" }] },
      opts
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].title).toBe("有内容的公司");
  });
});

describe("profileImportFromAiResult —— 技能与基本信息", () => {
  it("平铺的技能词归成一组，组名由调用方注入", () => {
    const { skillGroup } = profileImportFromAiResult(
      { skills: ["React", "TypeScript", "Node.js"] },
      { skillGroupName: "前端技能" }
    );
    expect(skillGroup).toEqual({ name: "前端技能", content: "React、TypeScript、Node.js" });
  });

  it("技能也能是字符串或带项目符号的整段", () => {
    const { skillGroup } = profileImportFromAiResult(
      { skillContent: "- React\n- Vue" },
      opts
    );
    expect(skillGroup?.content).toBe("React、Vue");
  });

  it("没有技能时不产出空技能组", () => {
    expect(profileImportFromAiResult({}, opts).skillGroup).toBeNull();
    expect(profileImportFromAiResult({ skills: [] }, opts).skillGroup).toBeNull();
  });

  it("基本信息只带模型真抽到的字段 —— 没抽到的不该覆盖用户已有内容", () => {
    const { basic } = profileImportFromAiResult(
      { basic: { name: "张三", email: "z@example.com", phone: "", location: "   " } },
      opts
    );
    expect(basic).toEqual({ name: "张三", email: "z@example.com" });
    expect("phone" in basic).toBe(false);
  });
});

describe("profileImportFromAiResult —— 容错", () => {
  it("输入是垃圾时不抛异常，也不凭空造内容", () => {
    for (const bad of [null, undefined, "字符串", 42, [], { education: "不是数组" }]) {
      const result = profileImportFromAiResult(bad, opts);
      expect(result.entities).toEqual([]);
      expect(result.skillGroup).toBeNull();
      expect(result.basic).toEqual({});
    }
  });

  it("不认识的板块不会被凭空造出来 —— 荣誉/语言/证书不在提取 schema 里", () => {
    const { entities } = profileImportFromAiResult(
      { honors: [{ name: "国家奖学金" }], languages: [{ name: "英语" }] },
      opts
    );
    expect(entities).toEqual([]);
  });

  it("每条产出的条目都带合法的 sectionId", () => {
    const { entities } = profileImportFromAiResult(
      {
        education: [{ school: "A" }],
        experience: [{ company: "B" }],
        projects: [{ name: "C" }],
      },
      opts
    );
    expect(entities.map((e) => e.sectionId)).toEqual(["education", "experience", "projects"]);
  });
});

describe("文本辅助函数", () => {
  it("toStringArray 兼容数组与带符号的多行文本", () => {
    expect(toStringArray(["a", " b ", ""])).toEqual(["a", "b"]);
    expect(toStringArray("1. 甲\n- 乙\n• 丙")).toEqual(["甲", "乙", "丙"]);
  });

  it("toListHtml 转义 HTML，避免简历里被注入标签", () => {
    expect(toListHtml(["<script>alert(1)</script>"])).toBe(
      "<ul><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul>"
    );
  });

  it("空输入产出空串，不留空标签", () => {
    expect(toListHtml([])).toBe("");
    expect(toListHtml(undefined)).toBe("");
  });
});
