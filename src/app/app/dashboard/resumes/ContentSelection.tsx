import { Star } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import type { ProfileEntity } from "@/types/profile";
import type { MatchAnalysis, MatchItemResult } from "@/types/jobTarget";
import { SECTION_DEFS } from "@/config/sections";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  analysis: MatchAnalysis | null;
  entities: ProfileEntity[];
  checked: Set<string>;
  onToggle: (entityId: string) => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  disabledSections: Set<string>;
  /**
   * 是否显示 AI 标注（★ 与理由）。
   *
   * 通用简历没有分析结果，**整条路径不碰 AI** —— 不显示星标、不显示推荐，
   * 用户自己点。岗位专用简历才有。
   */
  showAnnotations: boolean;
}

const ENTITY_SECTIONS = SECTION_DEFS.filter((s) => s.accepts.length > 0);

/**
 * 内容选择 —— 从投递目标页搬过来的候选清单，现在是「生成岗位专用简历」的一步。
 *
 * 设计要点（与原处一致，未改）：
 * - 未推荐的条目**同样展示**并给出理由，不允许静默隐藏
 * - **勾选状态完全由用户产生，AI 不预设**。「勾选 AI 推荐条目」是个按钮，
 *   点了才勾 —— 不是进页面就勾好。这条是刻意的（D19）：AI 一预设勾选，
 *   用户会直接点确认而不逐条审视，等于把决策权偷偷交回给 AI
 * - `★` 只表示名次（`inTopN`），不表示资格；且是**只读**的，用户点不了
 * - 无分析结果时（未配置 Key / 分析失败）不渲染任何标注，勾选与生成照常
 */
export const ContentSelection = ({
  analysis,
  entities,
  checked,
  onToggle,
  onToggleSection,
  disabledSections,
  showAnnotations,
}: Props) => {
  const t = useTranslations("dashboard.resumes.createDialog");
  // 板块名挂在 profile 命名空间下（与 SECTION_DEFS.titleKey 对应）。
  // 用别的命名空间取会拿到原始 key，界面上显示成 "sections.basic"。
  const tSection = useTranslations("profile");

  const byId = new Map(entities.map((e) => [e.id, e]));
  const grouped = ENTITY_SECTIONS.map((section) => ({
    section,
    items: entities
      .filter((e) => e.sectionId === section.id)
      .sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);

  // 「勾选 AI 推荐条目」= 勾上所有带 ★ 的。v4 起 level 与 inTopN 同源
  // （都由名次推导），所以这就是 AI 推荐的全集，不多不少。
  const checkRecommended = () => {
    if (!analysis) return;
    for (const [id, item] of Object.entries(analysis.items)) {
      if (item.level === "recommended" && byId.has(id) && !checked.has(id)) onToggle(id);
    }
  };

  // 与「清空」对称。默认全不勾是为了让用户自己过一遍，但条目多时逐个点太累，
  // 给一个一键全选作为起步 —— 先全上再取消不要的，与从零勾起是两种同样合理的用法
  const selectAll = () => {
    for (const e of entities) {
      if (!checked.has(e.id)) onToggle(e.id);
    }
  };

  const clearAll = () => {
    for (const id of Array.from(checked)) onToggle(id);
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("contentDesc")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{t("sections")}</span>
        {SECTION_DEFS.map((section) => (
          <label
            key={section.id}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
              section.required || !disabledSections.has(section.id)
                ? "border-primary/30 bg-primary/5"
                : "border-border/60 opacity-50"
            )}
          >
            <Switch
              className="scale-75"
              checked={section.required || !disabledSections.has(section.id)}
              disabled={section.required}
              onCheckedChange={(v) => onToggleSection(section.id, v)}
            />
            {tSection(section.titleKey)}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {analysis && showAnnotations && (
          <Button variant="outline" size="sm" onClick={checkRecommended}>
            {t("checkRecommended")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={selectAll}>
          {t("selectAll")}
        </Button>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          {t("clearAll")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {analysis && showAnnotations ? t("noDefaultHint") : t("plainNoDefaultHint")}
        </span>
      </div>

      {grouped.map(({ section, items }) => (
        <div key={section.id} className="space-y-1.5">
          <p className="text-sm font-semibold">
            {section.icon} {tSection(section.titleKey)}
          </p>
          {items.map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              item={showAnnotations ? analysis?.items[entity.id] : undefined}
              checked={checked.has(entity.id)}
              hasAnalysis={Boolean(analysis) && showAnnotations}
              onToggle={() => onToggle(entity.id)}
            />
          ))}
        </div>
      ))}

    </div>
  );
};

const EntityRow = ({
  entity,
  item,
  checked,
  hasAnalysis,
  onToggle,
}: {
  entity: ProfileEntity;
  item?: MatchItemResult;
  checked: boolean;
  hasAnalysis: boolean;
  onToggle: () => void;
}) => {
  const t = useTranslations("dashboard.resumes.createDialog");
  const notRecommended = item?.level === "not_recommended";

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border/60",
        notRecommended && "opacity-70"
      )}
    >
      <label className="flex cursor-pointer items-start gap-3 p-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{entity.title}</span>
            {item?.inTopN && (
              // 星标本身什么也不说，容易被读成「AI 认为该放」。v4 之后它
              // 只表示名次 —— 挂上 title 与 aria-label 把含义说清楚
              <span
                title={t("topNStarHint")}
                aria-label={t("topNStarHint")}
                className="shrink-0"
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[entity.subtitle, entity.dateRange].filter(Boolean).join(" · ")}
          </span>
          {hasAnalysis && !entity.description.trim() && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("emptyDescriptionHint")}
            </span>
          )}
          {hasAnalysis && item?.reason && (
            <span
              className={cn(
                "mt-1 block text-xs",
                notRecommended ? "text-muted-foreground" : "text-primary/80"
              )}
            >
              {item.reason}
            </span>
          )}
          {entity.tags.length > 0 && (
            <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {entity.tags[0]}
            </span>
          )}
        </span>
      </label>
    </div>
  );
};
