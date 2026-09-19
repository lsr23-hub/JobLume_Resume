import { DEFAULT_TEMPLATES } from "@/config";
import {
  initialResumeState,
  initialResumeStateEn,
} from "@/config/initialResumeData";
import type { ResumeData } from "@/types/resume";
import type { ResumeTemplate } from "@/types/template";

export const TEMPLATE_PREVIEW_WIDTH_PX = 794;
export const TEMPLATE_PREVIEW_HEIGHT_PX = 1123;
// 2：快照从 1588px PNG 换成 794px JPEG（见 generate-template-snapshots.ts）。
// 文件格式变了，版本跟着动 —— 目前没有校验方，留着是为了以后真加校验时不必回头考古。
export const TEMPLATE_SNAPSHOT_VERSION = 2;
export const TEMPLATE_SNAPSHOT_ROOT_ATTRIBUTE = "data-template-snapshot-root";
export const TEMPLATE_SNAPSHOT_ROOT_SELECTOR = `[${TEMPLATE_SNAPSHOT_ROOT_ATTRIBUTE}]`;
export const TEMPLATE_SNAPSHOT_PUBLIC_DIR = "template-snapshots";

/**
 * 快照的图片格式。
 *
 * 用 JPEG 而不是 PNG：这些图是**带文字的整页截图**，PNG 下每张 650KB，
 * 8 张就是 4.7MB —— 而落地页只用它们当小缩略图。JPEG q85 在同样尺寸下是 162KB。
 * Playwright 的元素截图只支持 png / jpeg 两种，所以选 JPEG 也省掉了一步额外的
 * 转码工具链。
 */
export const TEMPLATE_SNAPSHOT_EXT = "jpg";
export const TEMPLATE_PREVIEW_LOCALES = ["zh", "en"] as const;

export type TemplatePreviewLocale = (typeof TEMPLATE_PREVIEW_LOCALES)[number];

export interface TemplateSnapshotManifest {
  version: number;
  generatedAt: string | null;
  locales: Record<TemplatePreviewLocale, Record<string, string>>;
}

export const createEmptyTemplateSnapshotManifest =
  (): TemplateSnapshotManifest => ({
    version: TEMPLATE_SNAPSHOT_VERSION,
    generatedAt: null,
    locales: {
      zh: {},
      en: {},
    },
  });

export const isTemplatePreviewLocale = (
  value: string | null | undefined
): value is TemplatePreviewLocale =>
  value === "zh" || value === "en";

export const getTemplateById = (templateId: string | undefined): ResumeTemplate =>
  DEFAULT_TEMPLATES.find((template) => template.id === templateId) ??
  DEFAULT_TEMPLATES[0];

export const getTemplatePreviewBaseData = (locale: TemplatePreviewLocale) =>
  locale === "en" ? initialResumeStateEn : initialResumeState;

export const createTemplatePreviewData = (
  template: ResumeTemplate,
  locale: TemplatePreviewLocale
): ResumeData => {
  const baseData = getTemplatePreviewBaseData(locale);

  return {
    ...baseData,
    id: `preview-mock-${locale}-${template.id}`,
    templateId: template.id,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    globalSettings: {
      ...baseData.globalSettings,
      themeColor: template.colorScheme.primary,
      sectionSpacing: template.spacing.sectionGap,
      paragraphSpacing: template.spacing.itemGap,
      pagePadding: template.spacing.contentPadding,
    },
    basic: {
      ...baseData.basic,
      layout: template.basic.layout,
    },
  } as ResumeData;
};

export const getTemplateSnapshotPath = (
  locale: TemplatePreviewLocale,
  templateId: string
) => `/${TEMPLATE_SNAPSHOT_PUBLIC_DIR}/${locale}/${templateId}.${TEMPLATE_SNAPSHOT_EXT}`;

export const getTemplateSnapshotSrc = (
  manifest: TemplateSnapshotManifest,
  locale: TemplatePreviewLocale,
  templateId: string
) => manifest.locales[locale][templateId] ?? null;
