import { describe, expect, it } from "vitest";
import type { BasicInfo } from "@/types/resume";
import type { CareerProfile, ProfileEntity } from "@/types/profile";
import { hasUsableProfile } from "./hasUsableProfile";

/**
 * 这个判定有**两个性质完全不同的调用方**（见实现文件的头注释），而它们对"空"的
 * 容忍度相反：
 *
 * - `store/userScope.ts` 迁移时用它决定「这份档案值不值得算一个用户」
 * - `ImportProfileDialog` 用它决定「导入要不要先问一句存档」
 *
 * 后者是**防数据丢失的闸门**：判成空就直接覆盖、不问、也不给存档机会。
 * 所以下面每一条"只有一个维度有内容"的用例都必须为 true —— 漏掉任何一个维度，
 * 那个维度上的数据就成了一条静默丢失路径。
 */

const NOW = "2026-01-01T00:00:00.000Z";

const basic = (over: Partial<BasicInfo> = {}): BasicInfo => ({
  name: "",
  title: "",
  email: "",
  phone: "",
  location: "",
  birthDate: "",
  employementStatus: "",
  photo: "",
  photoConfig: { width: 90, height: 120, borderRadius: "none", customBorderRadius: 0 },
  icons: {},
  customFields: [],
  githubKey: "",
  githubUseName: "",
  githubContributionsVisible: false,
  ...over,
});

const entity = (id: string): ProfileEntity => ({
  id,
  type: "custom",
  sectionId: "experience",
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
});

const profile = (over: Partial<CareerProfile> = {}): CareerProfile => ({
  version: 1,
  basic: basic(),
  entities: {},
  sectionOrder: [],
  skillGroups: [],
  certificateText: "",
  languageText: "",
  selfEvaluationContent: "",
  meta: { createdAt: NOW, updatedAt: NOW, lastBackupAt: null },
  ...over,
});

describe("档案里有没有真东西", () => {
  it("null 与完全空的档案 → false", () => {
    expect(hasUsableProfile(null)).toBe(false);
    expect(hasUsableProfile(profile())).toBe(false);
  });

  it("只有姓名 → true", () => {
    expect(hasUsableProfile(profile({ basic: basic({ name: "张三" }) }))).toBe(true);
  });

  it("只有条目 → true", () => {
    expect(hasUsableProfile(profile({ entities: { e1: entity("e1") } }))).toBe(true);
  });

  // ── 以下四条是重点：它们都是「只有这一个维度有内容」的库 ──

  it("**只有技能分组 → true**（分组是手工排的，最不该被静默覆盖）", () => {
    expect(
      hasUsableProfile(profile({ skillGroups: [{ id: "g1", name: "前端", order: 0, content: "" }] }))
    ).toBe(true);
  });

  it("只有证书奖项文字 → true", () => {
    expect(hasUsableProfile(profile({ certificateText: "CET-6" }))).toBe(true);
  });

  it("只有语言能力 → true", () => {
    expect(hasUsableProfile(profile({ languageText: "英语 CET-6" }))).toBe(true);
  });

  it("只有自我评价 → true", () => {
    expect(hasUsableProfile(profile({ selfEvaluationContent: "五年经验" }))).toBe(true);
  });

  it("**全是空白字符 → false**（空字符串判「有」会让导入每次都白问一遍）", () => {
    expect(
      hasUsableProfile(
        profile({
          basic: basic({ name: "   " }),
          certificateText: "\n\t ",
          languageText: " ",
          selfEvaluationContent: "\n",
        })
      )
    ).toBe(false);
  });
});
