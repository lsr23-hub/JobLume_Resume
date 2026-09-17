import type { CareerProfile, ProfileEntity } from "@/types/profile";
import type {
  CustomItem,
  Education,
  Experience,
  GlobalSettings,
  MenuSection,
  Project,
  ResumeData,
  ResumeSnapshot,
} from "@/types/resume";
import { DEFAULT_FIELD_ORDER } from "@/config/constants";
import { splitDateRange } from "./entityUtils";

/** 上游 `initialResumeData.ts` 中的默认全局设置，保持一致 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  baseFontSize: 16,
  pagePadding: 32,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  sectionSpacing: 10,
  headerSize: 18,
  subheaderSize: 16,
  useIconMode: true,
  themeColor: "#000000",
  centerSubtitle: true,
  pageBreakLinesVisible: true,
};

export interface MaterializeInput {
  profile: CareerProfile;

  /**
   * 各板块选中的条目 id。未列出的板块不产出条目。
   * 这是「用户勾选」的唯一表达 —— 没有任何自动放入的条目。
   */
  selection: Record<string, string[]>;

  /** 选中的板块及其顺序 */
  sections: MenuSection[];

  /** 运行时元信息，由调用方提供以保持本函数为纯函数 */
  meta: {
    id: string;
    title: string;
    now: string;
    templateId: string | null;
  };

  globalSettings?: Partial<GlobalSettings>;
  snapshot?: ResumeSnapshot;
}

/**
 * 技能组 → 上游期望的富文本 HTML。
 *
 * 结构必须与 `initialResumeData.ts` 中的 `skillContent` 一致
 * （`div.skill-content > ul > li`），否则 9 套模板的 SkillSection 样式会失效。
 */
export const renderSkillContent = (profile: CareerProfile): string => {
  const items = [...profile.skillGroups]
    .filter((g) => g.content.trim())
    .sort((a, b) => a.order - b.order)
    .map((g) => `<li>${g.name}：${g.content}</li>`);

  if (items.length === 0) return "";

  return `<div class="skill-content">\n  <ul>\n${items.map((i) => `    ${i}`).join("\n")}\n  </ul>\n</div>`;
};

/** 板块内按 order 排序并过滤隐藏项 */
const pickEntities = (
  profile: CareerProfile,
  sectionId: string,
  selection: Record<string, string[]>
): ProfileEntity[] => {
  const ids = selection[sectionId];
  if (!ids?.length) return [];

  const byId = profile.entities;
  return ids
    .map((id) => byId[id])
    .filter((e): e is ProfileEntity => Boolean(e) && !e?.hidden)
    .sort((a, b) => a.order - b.order);
};

/**
 * 把职业数据库物化成一份简历。
 *
 * 纯函数：不读全局状态、不调用 `Date.now()`、不依赖输入顺序以外的任何东西。
 *
 * 条目按 `sectionId` 归类（而非 `type`）—— `sectionId` 是用户放置它的位置，
 * 也是 `selection` 的键，两者保持一致。
 */
export const materialize = (input: MaterializeInput): ResumeData => {
  const { profile, selection, sections, meta, globalSettings, snapshot } = input;

  const sourceMap: Record<string, string> = {};

  const education: Education[] = pickEntities(profile, "education", selection).map((e) => {
    const [startDate, endDate] = splitDateRange(e.dateRange);
    sourceMap[e.id] = e.id;
    return {
      id: e.id,
      school: e.title,
      major: e.subtitle,
      degree: e.degree ?? "",
      startDate,
      endDate,
      gpa: e.gpa ?? "",
      description: e.description,
      visible: true,
    };
  });

  const experience: Experience[] = pickEntities(profile, "experience", selection).map((e) => {
    sourceMap[e.id] = e.id;
    return {
      id: e.id,
      company: e.title,
      position: e.subtitle,
      date: e.dateRange,
      details: e.description,
      visible: true,
    };
  });

  const projects: Project[] = pickEntities(profile, "projects", selection).map((e) => {
    sourceMap[e.id] = e.id;
    return {
      id: e.id,
      name: e.title,
      role: e.subtitle,
      date: e.dateRange,
      description: e.description,
      visible: true,
      link: e.link,
      linkLabel: e.linkLabel,
    };
  });

  // 走 customData 通道的板块：模板对未识别的 sectionId 会回退到 CustomSection
  const customData: Record<string, CustomItem[]> = {};
  for (const section of sections) {
    const items = pickEntities(profile, section.id, selection);
    if (items.length === 0) continue;

    const isBuiltin =
      section.id === "education" || section.id === "experience" || section.id === "projects";
    if (isBuiltin) continue;

    customData[section.id] = items.map((e) => {
      sourceMap[e.id] = e.id;
      return {
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        dateRange: e.dateRange,
        description: e.description,
        visible: true,
      };
    });
  }

  const enabled = sections.filter((s) => s.enabled);

  return {
    id: meta.id,
    title: meta.title,
    createdAt: meta.now,
    updatedAt: meta.now,
    templateId: meta.templateId,
    // fieldOrder 缺失时兜底：模板在 fieldOrder 为空时**只渲染 email**，
    // 电话 / 所在地 / 生日 / 状态会全部丢失（BaseInfo.tsx 的 getOrderedFields）
    basic: {
      ...profile.basic,
      fieldOrder: profile.basic.fieldOrder ?? DEFAULT_FIELD_ORDER,
    },
    education,
    experience,
    projects,
    certificates: [...profile.certificates],
    customData,
    skillContent: renderSkillContent(profile),
    selfEvaluationContent: profile.selfEvaluationContent,
    activeSection: enabled[0]?.id ?? "basic",
    draggingProjectId: null,
    menuSections: sections,
    globalSettings: { ...DEFAULT_GLOBAL_SETTINGS, ...globalSettings },
    sourceMap,
    snapshot,
  };
};
