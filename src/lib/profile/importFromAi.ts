import { SECTION_IDS } from "@/config/sections";
import type { BasicInfo } from "@/types/resume";
import type { ProfileEntity } from "@/types/profile";

/**
 * 把「PDF 简历识图导入」的抽取结果映射成**职业数据库**的内容。
 *
 * 背景：这条导入路径是与上游一起进来的，产出的是**一份简历**（`ResumeData`）。
 * 但本项目的架构是「职业数据库是唯一事实来源」—— 导进来的内容落在简历层就享受不到
 * 匹配、复用、多版本生成，等于白导。所以改成落到数据库。
 *
 * 提取侧的 schema 不动（仍然是 `title/basic/education/experience/projects/skills`），
 * 只在这里做形状映射：**不改 prompt 就不会引入新的模型失败模式**。
 *
 * 已知取舍：那份 schema 里没有荣誉、语言、证书这些板块，所以 PDF 里这部分内容
 * 导不进来 —— 这是提取 schema 的限制，不是映射能解决的，要扩 schema 得单独一轮。
 */

// ─────────────────────────────────────────────────────────────
// 文本清洗（原在 resumes/utils.ts，被这里与简历导入共用）
// ─────────────────────────────────────────────────────────────

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const toString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(toString).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  return [];
};

/** 字符串数组 → 富文本列表；空数组得到空串（不产生空标签） */
export const toListHtml = (value: unknown): string => {
  const items = toStringArray(value);
  if (items.length === 0) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
};

// ─────────────────────────────────────────────────────────────
// 映射
// ─────────────────────────────────────────────────────────────

/**
 * 可以直接交给 `useCareerProfileStore().addEntity` 的形状。
 *
 * `id` / `order` / 时间戳 / 由 dateRange 派生的排序字段都由 store 负责，
 * 所以这里不需要也不应该自己造。
 */
export type ImportedEntity = Partial<
  Omit<ProfileEntity, "id" | "createdAt" | "updatedAt">
> & { sectionId: string };

export interface AiProfileImport {
  /** 只带模型真正抽到的字段，没抽到的不覆盖用户已有内容 */
  basic: Partial<BasicInfo>;
  entities: ImportedEntity[];
  /**
   * 模型给出的技能是一串平铺的词，而数据库里技能是**分组**的，
   * 所以归成一组。组名由调用方注入 —— 这个模块是纯函数，不读 i18n。
   */
  skillGroup: { name: string; content: string } | null;
}

const BASIC_FIELDS = [
  "name",
  "title",
  "email",
  "phone",
  "location",
  "employementStatus",
  "birthDate",
] as const;

/** 教育经历给的是起止两栏，数据库存的是一个区间字符串 */
const joinRange = (start: unknown, end: unknown): string => {
  const from = toString(start);
  const to = toString(end);
  if (from && to) return `${from} - ${to}`;
  return from || to;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 一条都没有内容就不产出空条目 —— 空条目会污染板块，还会拖累排序 */
const hasContent = (entity: ImportedEntity): boolean =>
  Boolean(
    entity.title?.trim() ||
      entity.subtitle?.trim() ||
      entity.dateRange?.trim() ||
      entity.description?.trim()
  );

export const profileImportFromAiResult = (
  result: unknown,
  options: { skillGroupName: string }
): AiProfileImport => {
  const root = asRecord(result);

  const basic: Partial<BasicInfo> = {};
  const rawBasic = asRecord(root.basic);
  for (const field of BASIC_FIELDS) {
    const value = toString(rawBasic[field]);
    if (value) basic[field] = value;
  }

  const entities: ImportedEntity[] = [];

  for (const raw of asArray(root.education)) {
    const item = asRecord(raw);
    entities.push({
      type: "education",
      sectionId: "education",
      title: toString(item.school),
      subtitle: toString(item.major),
      degree: toString(item.degree) || undefined,
      gpa: toString(item.gpa) || undefined,
      dateRange: joinRange(item.startDate, item.endDate),
      description: toListHtml(item.description),
      tags: [],
      skills: [],
      metrics: [],
    });
  }

  for (const raw of asArray(root.experience)) {
    const item = asRecord(raw);
    entities.push({
      type: "experience",
      sectionId: "experience",
      title: toString(item.company),
      subtitle: toString(item.position),
      dateRange: toString(item.date),
      description: toListHtml(item.details ?? item.description),
      tags: [],
      skills: [],
      metrics: [],
    });
  }

  for (const raw of asArray(root.projects)) {
    const item = asRecord(raw);
    entities.push({
      type: "project",
      sectionId: "projects",
      title: toString(item.name),
      subtitle: toString(item.role),
      dateRange: toString(item.date),
      description: toListHtml(item.description ?? item.details),
      link: toString(item.link) || undefined,
      linkLabel: toString(item.linkLabel) || undefined,
      tags: [],
      skills: [],
      metrics: [],
    });
  }

  const skills = toStringArray(root.skillContent ?? root.skills);
  const skillGroup =
    skills.length > 0 ? { name: options.skillGroupName, content: skills.join("、") } : null;

  return {
    basic,
    entities: entities.filter(hasContent),
    skillGroup,
  };
};

/** 只保留数据库里真实存在的板块 —— 模型给出未知 sectionId 时不该写进去 */
export const isKnownSection = (sectionId: string): boolean => SECTION_IDS.includes(sectionId);
