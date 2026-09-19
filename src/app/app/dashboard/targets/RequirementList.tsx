import { useState } from "react";
import { useTranslations } from "@/i18n/compat/client";
import type { ProfileEntity } from "@/types/profile";
import type {
  MatchAnalysis,
  Requirement,
  RequirementKind,
  RequirementStatus,
} from "@/types/jobTarget";
import { requirementsOf } from "@/lib/match/validateMatchResult";
import { cn } from "@/lib/utils";

/**
 * JD 要求项清单。
 *
 * 取代了原来那三行平铺文本（「✓ 已覆盖：…」）—— 那种写法里每条判定都指不出
 * 具体经历，用户无从核对，也无从知道模型把 JD 读成了什么。
 *
 * 三条设计取舍：
 * - **每条判定都要指出支撑它的经历**。指不出的判定在校验阶段就已经降级了，
 *   所以这里不会出现「凭空断言你缺什么」。
 * - **职责（duty）不显示 ✓/✗**：没做过 JD 里写的某段职责不是缺陷，是换工作的常态。
 * - **没有原文依据的要求照常显示**，只标一句「无原文依据」——
 *   隐含要求本来就引不出原文，丢掉它等于丢掉最有价值的那部分。
 */

const GROUPS: Array<{ kind: RequirementKind; labelKey: string }> = [
  { kind: "must", labelKey: "requirements.must" },
  { kind: "nice", labelKey: "requirements.nice" },
  { kind: "duty", labelKey: "requirements.duty" },
];

const STATUS: Record<
  RequirementStatus,
  { icon: string; className: string; labelKey: string }
> = {
  covered: {
    icon: "✓",
    className: "text-emerald-600 dark:text-emerald-400",
    labelKey: "coverage.covered",
  },
  weak: {
    icon: "⚠",
    className: "text-amber-600 dark:text-amber-400",
    labelKey: "coverage.weak",
  },
  missing: { icon: "✗", className: "text-destructive", labelKey: "coverage.missing" },
};

interface Props {
  analysis: MatchAnalysis;
  entities: ProfileEntity[];
}

export const RequirementList = ({ analysis, entities }: Props) => {
  const t = useTranslations("targets");
  const [openQuote, setOpenQuote] = useState<Set<string>>(new Set());
  const requirements = requirementsOf(analysis);

  const titles = new Map(entities.map((e) => [e.id, e.title]));
  const byId = new Set(entities.map((e) => e.id));

  // 分析在，却一条要求都没有 —— 这是模型返回的结构不对，不是「这份 JD 没要求」。
  // 必须显式说出来：静默不渲染会让人以为这个功能消失了
  if (requirements.length === 0) {
    return (
      <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold">{t("requirements.emptyTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("requirements.emptyHint")}</p>
      </div>
    );
  }

  const missingCount = requirements.filter(
    (r) => r.kind !== "duty" && r.status === "missing"
  ).length;

  const toggleQuote = (id: string) =>
    setOpenQuote((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{t("requirements.title")}</p>
        <p className="text-xs text-muted-foreground">
          {t("requirements.summary", { total: requirements.length, missing: missingCount })}
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = requirements.filter((r) => r.kind === group.kind);
        if (items.length === 0) return null;

        return (
          <div key={group.kind} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{t(group.labelKey)}</p>
            <ul className="space-y-1.5">
              {items.map((requirement) => (
                <RequirementRow
                  key={requirement.id}
                  requirement={requirement}
                  titles={titles}
                  knownIds={byId}
                  quoteOpen={openQuote.has(requirement.id)}
                  onToggleQuote={() => toggleQuote(requirement.id)}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {missingCount > 0 && (
        <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
          {t("coverage.missingNote")}
        </p>
      )}

      {analysis.summary.advice && (
        <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
          💡 {analysis.summary.advice}
        </p>
      )}
    </div>
  );
};

const RequirementRow = ({
  requirement,
  titles,
  knownIds,
  quoteOpen,
  onToggleQuote,
}: {
  requirement: Requirement;
  titles: Map<string, string>;
  knownIds: Set<string>;
  quoteOpen: boolean;
  onToggleQuote: () => void;
}) => {
  const t = useTranslations("targets");
  const status = STATUS[requirement.status];
  // 职责不判断缺不缺，因此不给状态徽章
  const showStatus = requirement.kind !== "duty";

  // 支撑这条要求的经历。只作**证据**展示 —— 它回答「这条要求凭什么算 covered」，
  // 与 sourceQuote 同一性质。勾选状态是另一件事，不在这里体现。
  const supporting = requirement.entityIds.filter((id) => knownIds.has(id));

  return (
    <li className="flex items-start gap-2 text-xs">
      {showStatus && (
        <span
          className={cn("mt-px w-3 shrink-0 text-center", status.className)}
          title={t(status.labelKey)}
          aria-label={t(status.labelKey)}
        >
          {status.icon}
        </span>
      )}

      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("leading-relaxed", !showStatus && "text-muted-foreground")}>
          {requirement.text}
          {!requirement.sourceQuote && (
            <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
              {t("requirements.noQuote")}
            </span>
          )}
        </p>

        {(supporting.length > 0 || requirement.sourceQuote) && (
          <div className="flex flex-wrap items-center gap-1">
            {supporting.map((entityId) => (
              <span
                key={entityId}
                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
              >
                {titles.get(entityId) ?? entityId}
              </span>
            ))}
            {requirement.sourceQuote && (
              <button
                type="button"
                onClick={onToggleQuote}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
              >
                {t("requirements.quote")}
              </button>
            )}
          </div>
        )}

        {quoteOpen && requirement.sourceQuote && (
          <p className="border-l-2 border-muted-foreground/30 pl-2 italic text-muted-foreground">
            {requirement.sourceQuote}
          </p>
        )}
      </div>
    </li>
  );
};
