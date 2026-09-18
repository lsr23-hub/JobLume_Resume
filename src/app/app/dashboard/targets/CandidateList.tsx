import { Star } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "@/i18n/compat/client";
import type { ProfileEntity } from "@/types/profile";
import type { MatchAnalysis, MatchItemResult } from "@/types/jobTarget";
import { SECTION_DEFS } from "@/config/sections";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { RequirementList } from "./RequirementList";

interface Props {
  analysis: MatchAnalysis | null;
  entities: ProfileEntity[];
  checked: Set<string>;
  onToggle: (entityId: string) => void;
  onToggleSection: (sectionId: string, enabled: boolean) => void;
  disabledSections: Set<string>;
}

const ENTITY_SECTIONS = SECTION_DEFS.filter((s) => s.accepts.length > 0);

/**
 * 候选清单 —— 本产品的核心交互。
 *
 * 设计要点：
 * - 未推荐的条目**同样展示**并给出理由，不允许静默隐藏
 * - 勾选状态完全由用户产生，AI 不预设（提供「全选推荐项」辅助）
 * - `★` 只表示优先级、不表示资格；未入选 top-N 的推荐项同样是推荐
 * - 无分析结果时（未配置 Key / 分析失败）不渲染任何标注，勾选与生成照常
 */
export const CandidateList = ({
  analysis,
  entities,
  checked,
  onToggle,
  onToggleSection,
  disabledSections,
}: Props) => {
  const t = useTranslations("targets");
  // 板块名挂在 profile 命名空间下（与 SECTION_DEFS.titleKey 对应）。
  // 用 targets 命名空间取会拿到原始 key，界面上显示成 "sections.basic"。
  const tSection = useTranslations("profile");

  const byId = new Map(entities.map((e) => [e.id, e]));
  const grouped = ENTITY_SECTIONS.map((section) => ({
    section,
    items: entities
      .filter((e) => e.sectionId === section.id)
      .sort((a, b) => a.order - b.order),
  })).filter((g) => g.items.length > 0);

  const selectAllRecommended = () => {
    if (!analysis) return;
    for (const [id, item] of Object.entries(analysis.items)) {
      if (item.level === "recommended" && byId.has(id) && !checked.has(id)) onToggle(id);
    }
  };

  const clearAll = () => {
    for (const id of Array.from(checked)) onToggle(id);
  };

  return (
    <div className="space-y-5">
      {analysis && (
        <RequirementList
          analysis={analysis}
          entities={entities}
          checked={checked}
          onToggle={onToggle}
        />
      )}

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

      {analysis && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAllRecommended}>
            {t("selectTopRanked")}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t("clearAll")}
          </Button>
          <span className="text-xs text-muted-foreground">{t("noDefaultHint")}</span>
        </div>
      )}

      {grouped.map(({ section, items }) => (
        <div key={section.id} className="space-y-1.5">
          <p className="text-sm font-semibold">
            {section.icon} {tSection(section.titleKey)}
          </p>
          {items.map((entity) => (
            <EntityRow
              key={entity.id}
              entity={entity}
              item={analysis?.items[entity.id]}
              checked={checked.has(entity.id)}
              hasAnalysis={Boolean(analysis)}
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
  const t = useTranslations("targets");
  const notRecommended = item?.level === "not_recommended";

  return (
    <div
      id={`candidate-${entity.id}`}
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
