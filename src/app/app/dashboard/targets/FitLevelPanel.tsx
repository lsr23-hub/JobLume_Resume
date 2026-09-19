import { useTranslations } from "@/i18n/compat/client";
import { fitLevelOf, type FitLevel } from "@/lib/match/fitLevel";
import type { MatchAnalysis } from "@/types/jobTarget";
import { cn } from "@/lib/utils";

/**
 * 岗位级适配度等级。
 *
 * 给出结论，并把**判定依据**紧跟在下面一行 —— 等级本身是个抽象概括，
 * 用户要能立刻看到它是由哪几条要求推出来的（详细依据在下面的要求项清单里）。
 *
 * 色彩与要求项的状态徽章同一套语义：绿=好、琥珀=有短板、红=有缺口、
 * 灰=判不了。不做「分数环」「百分比」这类看起来精确的东西 ——
 * 等级是从三条状态推出来的，画成 87 分是在暗示一个不存在的精度。
 */

const TONE: Record<FitLevel, string> = {
  strong: "border-emerald-500/30 bg-emerald-500/5",
  partial: "border-amber-500/30 bg-amber-500/5",
  gap: "border-destructive/30 bg-destructive/5",
  unknown: "border-border/60 bg-muted/30",
};

const TITLE: Record<FitLevel, string> = {
  strong: "text-emerald-700 dark:text-emerald-400",
  partial: "text-amber-700 dark:text-amber-400",
  gap: "text-destructive",
  unknown: "text-muted-foreground",
};

export const FitLevelPanel = ({ analysis }: { analysis: MatchAnalysis }) => {
  const t = useTranslations("targets");
  const fit = fitLevelOf(analysis);

  // 理由文案里带计数的三种
  const count =
    fit.reason === "must_missing"
      ? fit.counts.mustMissing
      : fit.reason === "must_thin"
        ? fit.counts.mustThin
        : fit.counts.niceMissing;

  return (
    <div className={cn("space-y-1.5 rounded-xl border p-4", TONE[fit.level])}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn("text-base font-semibold", TITLE[fit.level])}>
          {t(`fit.level.${fit.level}`)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(`fit.reason.${fit.reason}`, { count })}
        </span>
      </div>

      {fit.legacy && (
        <p className="text-xs text-muted-foreground">{t("fit.legacy")}</p>
      )}

      <p className="text-xs text-muted-foreground">{t("fit.hint")}</p>
    </div>
  );
};
