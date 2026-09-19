import type { MatchAnalysis } from "./jobTarget";

export interface PhotoConfig {
  width: number;
  height: number;
  borderRadius: "none" | "medium" | "full" | "custom";
  customBorderRadius: number;
  visible?: boolean;
}

export const DEFAULT_CONFIG: PhotoConfig = {
  width: 90,
  height: 120,
  borderRadius: "none",
  customBorderRadius: 0,
  visible: true,
};

/**
 * 证件照三档尺寸。单位是简历画布的 px（画布宽 210mm ≈ 794px），
 * 所以「大」约占版心宽度的 15%。
 *
 * 三档**全部是 3:4**，与 `PhotoCropper` 的固定裁剪比例一致。
 * 比例若与裁剪结果不符，模板上的 `object-fit: cover` 会把用户刚
 * 调好的构图二次裁掉 —— 所见非所得。因此这里不再提供自由比例。
 *
 * 中档 90×120 就是历史默认值，已有的简历选到「中」不会变样。
 */
export const PHOTO_SIZE_PRESETS = [
  { id: "sm", width: 72, height: 96 },
  { id: "md", width: 90, height: 120 },
  { id: "lg", width: 120, height: 160 },
] as const;

export type PhotoSizeId = (typeof PHOTO_SIZE_PRESETS)[number]["id"];

/**
 * 由 width 就近推导当前档位。
 *
 * 为什么不新增一个 `size` 字段：老数据里存的是任意自定义宽高，
 * 加了字段就得做一次迁移才能让它们落进某一档。就近推导对老数据
 * 自动生效，用户点一次档位即被归一到该档的宽高。
 */
export const matchPhotoSizePreset = (width: number): PhotoSizeId => {
  const w = Number.isFinite(width) ? width : DEFAULT_CONFIG.width;
  return PHOTO_SIZE_PRESETS.reduce((best, preset) =>
    Math.abs(preset.width - w) < Math.abs(best.width - w) ? preset : best
  ).id;
};

export const getBorderRadiusValue = (config?: PhotoConfig) => {
  if (!config) return "0";

  switch (config.borderRadius) {
    case "medium":
      return "0.5rem";
    case "full":
      return "9999px";
    case "custom":
      return `${config.customBorderRadius}px`;
    default:
      return "0";
  }
};

export interface BasicFieldType {
  id: string;
  key: keyof BasicInfo;
  label: string;
  type?: "date" | "textarea" | "text" | "editor";
  visible: boolean;
  custom?: boolean;
}

export interface CustomFieldType {
  id: string;
  label: string;
  value: string;
  icon?: string;
  visible?: boolean;
  custom?: boolean;
  displayLabel?: boolean;
}
export interface BasicInfo {
  birthDate: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  icons: Record<string, string>;
  employementStatus: string;
  photo: string;
  photoConfig: PhotoConfig;
  fieldOrder?: BasicFieldType[];
  customFields: CustomFieldType[];
  githubKey: string;
  githubUseName: string;
  githubContributionsVisible: boolean;
  layout?: "left" | "center" | "right";
}

export interface Education {
  id: string;
  school: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  description?: string;
  /**
   * 「简要模式」下被藏起来的学校简介。
   *
   * 简要模式由编辑器切换：开启时把 `description` 挪到这里、把 `description` 清空，
   * 关闭时挪回来。**模板一行都不用改** —— 它们本来就用
   * `hasMeaningfulRichTextContent(description)` 门控简介，清空即不渲染。
   * 这是为了守住 C2「不修改 4 套模板的 section 组件」。
   *
   * 值不是字符串就是不存在；`undefined` 表示当前没藏东西。
   */
  hiddenDescription?: string;
  visible?: boolean;
}

export interface Experience {
  id: string;
  company: string;
  position: string;
  date: string;
  details: string;
  visible?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  level: number;
}

export interface Project {
  id: string;
  name: string;
  role: string;
  date: string;
  description: string;
  visible: boolean;
  link?: string;
  linkLabel?: string;
}

export interface Certificate {
  id: string;
  url: string; // Base64 encoding for the image or direct URL
  width: number; // Width percentage to support flex layouts
}

export type GlobalSettings = {
  themeColor?: string | undefined;
  fontFamily?: string | undefined;
  baseFontSize?: number | undefined;
  pagePadding?: number | undefined;
  paragraphSpacing?: number | undefined;
  lineHeight?: number | undefined;
  sectionSpacing?: number | undefined;
  headerSize?: number | undefined;
  subheaderSize?: number | undefined;
  useIconMode?: boolean | undefined;
  centerSubtitle?: boolean | undefined;
  flexibleHeaderLayout?: boolean | undefined;
  autoOnePage?: boolean | undefined;
  pageBreakLinesVisible?: boolean | undefined;
  /**
   * 板块级的展示覆盖（副标题居中 / 长标题模式）。
   *
   * 没列出的板块沿用上面那两个全局字段 —— 全局值因此退化成默认值，
   * 存量简历的外观零变化，不需要迁移。见 `@/lib/sectionSettings`。
   */
  sectionOverrides?: Record<
    string,
    { centerSubtitle?: boolean; flexibleHeaderLayout?: boolean }
  >;
};

export interface ResumeTheme {
  id: string;
  name: string;
  color: string;
}

export interface CustomItem {
  id: string;
  title: string;
  subtitle: string;
  dateRange: string;
  description: string;
  visible: boolean;
}

export const THEME_COLORS = [
  "#000000",
  "#1A1A1A",
  "#333333",
  "#4D4D4D",
  "#666666",
  "#808080",
  "#999999",
  "#0047AB",
  "#8B0000",
  "#FF4500",
  "#4B0082",
  "#2E8B57",
];

export interface MenuSection {
  id: string;
  title: string;
  icon: string;
  enabled: boolean;
  order: number;
}

export interface ResumeData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  templateId: string | null | undefined;
  basic: BasicInfo;
  education: Education[];
  experience: Experience[];
  projects: Project[];
  certificates: Certificate[];
  customData: Record<string, CustomItem[]>;
  skillContent: string;
  selfEvaluationContent: string;
  activeSection: string;
  draggingProjectId: string | null;
  menuSections: MenuSection[];
  globalSettings: GlobalSettings;

  /**
   * 来源映射：简历中的 itemId → 职业数据库中的 entityId。
   * 用于溯源与「同步回数据库」。
   */
  sourceMap?: Record<string, string>;

  /** 生成快照：记录这份简历是怎么来的 */
  snapshot?: ResumeSnapshot;
}

export interface ResumeSnapshot {
  /** 生成模式 */
  mode: "generic" | "targeted" | "manual";

  /** 关联的投递目标（通用简历为 null） */
  jobTargetId: string | null;

  /** JD 正文快照 —— 防止投递目标被修改后无法追溯 */
  jdSnapshot?: string;

  /**
   * 生成时的分析结果快照。
   * 直接拷贝 JobTarget.matchAnalysis，使简历可独立回溯
   * 「当时是根据什么判断选的这些内容」，即使投递目标后来被改动或删除。
   */
  matchAnalysisSnapshot?: MatchAnalysis;

  /** 各板块选中的条目 id */
  selectedEntityIds?: Record<string, string[]>;

  /**
   * 生成这份简历的用户（`currentUserId`）。
   *
   * 多用户下用于溯源：`selectedEntityIds` / `sourceMap` 指向的是**哪个人的**经历。
   * 可选 —— 改造前生成的简历没有它。仅作记录，不参与渲染或生成逻辑。
   */
  profileId?: string;

  /** 生成时间 */
  generatedAt: string;
}

export interface ResumeStore {
  resumes: ResumeData[];
  currentResumeId: string | null;
  currentResume: ResumeData | null;
  addResume: (resume: Omit<ResumeData, "id">) => void;
  updateResume: (id: string, data: Partial<ResumeData>) => void;
  deleteResume: (id: string) => void;
  setCurrentResume: (id: string) => void;
  updateBasicInfo: (info: Partial<ResumeData["basic"]>) => void;
  addEducation: (education: Omit<ResumeData["education"][0], "id">) => void;
  updateEducation: (
    educationId: string,
    data: Partial<ResumeData["education"][0]>
  ) => void;
  removeEducation: (educationId: string) => void;
  addExperience: (experience: Omit<ResumeData["experience"][0], "id">) => void;
  updateExperience: (
    experienceId: string,
    data: Partial<ResumeData["experience"][0]>
  ) => void;
  removeExperience: (experienceId: string) => void;
  updateSkillContent: (skillContent: string) => void;
  addCertificate: (certificate: Certificate) => void;
  updateCertificate: (id: string, updates: Partial<Certificate>) => void;
  updateCertificatesBatch: (certificates: Certificate[]) => void;
  removeCertificate: (id: string) => void;
}
