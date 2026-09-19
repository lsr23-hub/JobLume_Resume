import type { BasicInfo } from "./resume";

/**
 * 条目的语义类型。
 * 决定字段校验规则；与展示位置（sectionId）分离，
 * 以支持「把某个项目放进校园经历板块」这类用法。
 */
export type EntityType =
  | "education" // 教育经历
  | "experience" // 工作 / 实习经历
  | "project" // 项目经验
  | "campus" // 校园经历
  | "honors" // 获奖情况
  | "custom"; // 用户自建

export interface ProfileEntity {
  id: string;
  type: EntityType;

  /** 所属板块，决定在数据库编辑界面和简历里的归属 */
  sectionId: string;

  // ─────────── 内容字段（会出现在简历上）───────────

  /** 主标题：公司名 / 学校名 / 项目名 / 荣誉名 */
  title: string;
  /** 副标题：职位 / 专业 / 角色 */
  subtitle: string;
  /** 时间范围，如 `2021.07 - 2024.12` 或 `2021.07 - 至今` */
  dateRange: string;
  /** 描述（富文本 HTML） */
  description: string;

  /** 外链，仅项目类型使用 */
  link?: string;
  linkLabel?: string;

  /** 教育经历专用 */
  gpa?: string;
  degree?: string;

  // ─────────── 提示字段（不出现在简历上，作为 LLM 分析的补充信号）───────────
  //
  // v1 中系统不填充这些字段 —— LLM 分析时直接读 description 理解内容。
  // 保留给用户想显式强调时使用，全部留空不影响任何功能。

  /** 粗粒度标签。`tags[0]` 兼作类别，在经历列表与候选人列表上作为展示标签 */
  tags: string[];
  /** 具体技能关键词 */
  skills: string[];
  /** 量化成果 */
  metrics: string[];

  // ─────────── 元信息 ───────────

  /** 由 dateRange 解析而来，用于排序。写入时计算，避免排序热路径上跑正则 */
  endTimestamp?: number;
  /**
   * dateRange 是否表示「仍在进行中」（如「至今」）。
   * 此类条目永远按最新处理，不会随时间推移被算成越来越旧。
   */
  isCurrent?: boolean;
  /** 是否隐藏（不参与任何生成） */
  hidden?: boolean;
  /** 板块内排序 */
  order: number;

  createdAt: string;
  updatedAt: string;
}

export interface SkillGroup {
  id: string;
  /** 技能组名称，如「前端框架」 */
  name: string;
  /** 展示内容，如「React、Vue.js、Next.js」 */
  content: string;
  order: number;
}

export interface CareerProfile {
  /** schema 版本，用于未来迁移 */
  version: 1;

  /** 基本信息（复用简历层的 BasicInfo 类型） */
  basic: BasicInfo;

  /** 全部条目，key 为 entity.id */
  entities: Record<string, ProfileEntity>;

  /** 板块顺序（数据库编辑界面的 Tab 顺序） */
  sectionOrder: string[];

  /** 技能组 */
  skillGroups: SkillGroup[];

  /**
   * 证书奖项。纯文本，一行一条。
   *
   * 原为 `Certificate[]` 图片列表（二进制存 IndexedDB），但实际用起来证书多是
   * 「CET-6」这类一行文字，传图是负担。生成简历时并进技能板块的一行。
   */
  certificateText: string;

  /**
   * 语言能力，纯文本多行。
   *
   * 原为独立的「语言能力」板块（条目式），现与证书同形态：并入「专业技能」
   * 板块，生成简历时并成一行。存量条目由 `syncLanguageText` 迁进来。
   */
  languageText: string;

  /** 自我评价 */
  selfEvaluationContent: string;

  meta: {
    createdAt: string;
    updatedAt: string;
    lastBackupAt: string | null;
  };
}

/** 创建一份空的职业数据库 */
export const createEmptyProfile = (basic: BasicInfo, now: string): CareerProfile => ({
  version: 1,
  basic,
  entities: {},
  sectionOrder: [],
  skillGroups: [],
  certificateText: "",
  languageText: "",
  selfEvaluationContent: "",
  meta: { createdAt: now, updatedAt: now, lastBackupAt: null },
});
