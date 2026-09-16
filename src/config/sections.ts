import type { EntityType } from "@/types/profile";
import type { CustomFieldType } from "@/types/resume";

export interface SectionDef {
  id: string;
  title: string;
  icon: string;

  /** 必备板块：生成简历时默认勾选且不可取消 */
  required: boolean;

  /** 系统预设板块不可删除，只能停用 */
  preset: boolean;

  /** 该板块接受的条目类型（空数组表示不使用 entities，如技能/证书） */
  accepts: EntityType[];
}

/**
 * 职业数据库的板块定义。
 *
 * `id` 必须与简历层的 `MenuSection.id` 保持一致 —— 这是数据库能物化成
 * 简历、并被 9 套模板渲染的前提（模板对未识别的 id 走 customData 回退分支）。
 *
 * 与 `@/config/modules` 的 `STANDARD_MODULES` 是不同层的概念：
 * 后者是「简历里可以添加哪些模块」，这里是「数据库有哪些板块」。
 * 两者共享同一套 id 字符串。
 */
export const SECTION_DEFS: SectionDef[] = [
  { id: "basic", title: "基本信息", icon: "👤", required: true, preset: true, accepts: [] },
  { id: "education", title: "教育经历", icon: "🎓", required: true, preset: true, accepts: ["education"] },
  { id: "experience", title: "经历", icon: "💼", required: true, preset: true, accepts: ["experience"] },
  { id: "skills", title: "技能", icon: "⚡", required: true, preset: true, accepts: [] },
  { id: "certificates", title: "证书", icon: "🏆", required: true, preset: true, accepts: [] },
  { id: "projects", title: "项目经验", icon: "🚀", required: false, preset: true, accepts: ["project"] },
  { id: "selfEvaluation", title: "自我评价", icon: "💬", required: false, preset: true, accepts: [] },
  { id: "campus", title: "校园经历", icon: "🏫", required: false, preset: true, accepts: ["campus"] },
  { id: "honors", title: "荣誉课程", icon: "🎖️", required: false, preset: true, accepts: ["honors"] },
  { id: "languages", title: "语言能力", icon: "🌐", required: false, preset: true, accepts: ["languages"] },
];

export const SECTION_IDS = SECTION_DEFS.map((s) => s.id);

export const getSectionDef = (id: string): SectionDef | undefined =>
  SECTION_DEFS.find((s) => s.id === id);

/** 数据库界面默认展开的板块顺序 */
export const DEFAULT_SECTION_ORDER = SECTION_DEFS.map((s) => s.id);

/**
 * 基本信息板块的预设自定义字段。
 *
 * 复用简历层已有的 `BasicInfo.customFields` 通道 —— 无需改类型，
 * 也无需改模板：BaseInfo 组件已经会渲染 customFields。
 *
 * `displayLabel` 的语义（见 `@/lib/customField`）：
 * - `false` → 渲染「值」，图标模式下为 `<图标> 值`（简历上的正确形态）
 * - `true`  → 渲染「标签」文本，值仅作为跳转链接（会丢掉可读的 URL）
 *
 * 简历是要打印/导出的，所以一律用 `false` 让内容可见。
 */
export const PRESET_BASIC_FIELDS: CustomFieldType[] = [
  { id: "politics", label: "政治面貌", value: "", icon: "Flag", visible: true, displayLabel: false },
  { id: "website", label: "个人网站", value: "", icon: "Globe", visible: true, displayLabel: false },
  { id: "portfolio", label: "作品集", value: "", icon: "Github", visible: true, displayLabel: false },
  { id: "hometown", label: "籍贯", value: "", icon: "MapPin", visible: false, displayLabel: false },
  { id: "salary", label: "期望薪资", value: "", icon: "Wallet", visible: false, displayLabel: false },
  { id: "availability", label: "到岗时间", value: "", icon: "Clock", visible: false, displayLabel: false },
];
