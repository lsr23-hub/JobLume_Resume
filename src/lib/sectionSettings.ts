import type { GlobalSettings } from "@/types/resume";

/**
 * 板块级的展示覆盖。
 *
 * 「副标题居中」与「长标题模式」原先挂在 `globalSettings` 上，一套模板一个值。
 * 现在每个板块各管各的 —— 但**不删全局字段**，而是让它退化成默认值：
 * 某板块没设过覆盖就沿用全局值。这样存量简历的外观零变化，不需要数据迁移。
 *
 * 覆盖值不写进模板的 section 组件，而是**在模板 index 里合并** ——
 * `index.tsx` 本来就把 `globalSettings` 逐个传给 section，在那里换成合并后的
 * 对象即可，16 个 section 组件一行都不用改（守住 C2）。
 */
export type SectionDisplayOverride = Pick<
  GlobalSettings,
  "centerSubtitle" | "flexibleHeaderLayout"
>;

export const sectionOverridesOf = (
  settings: GlobalSettings
): Record<string, SectionDisplayOverride> => settings.sectionOverrides ?? {};

/**
 * 把某个板块的覆盖合并进 `globalSettings`，供模板 index 传给该板块的组件。
 * 没有覆盖时原样返回全局值 —— 这就是「不迁移也保持原样」的那一步。
 */
export const withSectionOverrides = (
  settings: GlobalSettings,
  sectionId: string
): GlobalSettings => ({
  ...settings,
  ...(settings.sectionOverrides?.[sectionId] ?? {}),
});

/** 该板块当前生效的两个值（覆盖优先，否则取全局默认） */
export const effectiveSectionDisplay = (
  settings: GlobalSettings,
  sectionId: string
): Required<SectionDisplayOverride> => {
  const merged = withSectionOverrides(settings, sectionId);
  return {
    centerSubtitle: Boolean(merged.centerSubtitle),
    flexibleHeaderLayout: Boolean(merged.flexibleHeaderLayout),
  };
};

/** 写入某板块的一个覆盖值；不碰其它板块，也不碰全局字段 */
export const withSectionDisplay = (
  settings: GlobalSettings,
  sectionId: string,
  patch: Partial<SectionDisplayOverride>
): GlobalSettings => ({
  ...settings,
  sectionOverrides: {
    ...settings.sectionOverrides,
    [sectionId]: { ...settings.sectionOverrides?.[sectionId], ...patch },
  },
});
