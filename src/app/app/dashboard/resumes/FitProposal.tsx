import { TriangleAlert } from "lucide-react";

import { useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import type { FitPlan } from "@/lib/profile/pageBudget";
import type { FitHintKey } from "./useTemplateFit";

/**
 * 篇幅超出的提议。
 *
 * **只是提议** —— 删经历不可逆，系统把「删哪几条、为什么」算好摆出来，
 * 是否生效由用户按下去的那一下决定（见 `docs/03-generation-algorithm.md` §2.3）。
 */
export const FitProposal = ({
  plan,
  hintKey,
  onApply,
  onKeepAll,
}: {
  plan: FitPlan;
  hintKey: FitHintKey;
  onApply: () => void;
  onKeepAll: () => void;
}) => {
  const t = useTranslations();
  const key = (k: string) => `dashboard.resumes.createDialog.${k}`;

  return (
    <div className="max-w-3xl mx-auto pt-4 space-y-5">
      <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-6 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
          <TriangleAlert className="w-5 h-5" />
          {t(key("fitSummary"), { pages: plan.pagesBefore, target: plan.targetPages })}
        </div>
        <p className="text-sm text-amber-900/80 dark:text-amber-200/80">{t(key(hintKey))}</p>
        {plan.relaxed && (
          <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
            {t(key("fitRelaxed"), { target: plan.targetPages })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {t(key("fitAfter"), { count: plan.removed.length, pages: plan.pagesAfter })}
        </p>
        <ul className="space-y-2">
          {plan.removed.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border/60 dark:border-gray-800/60 bg-muted/50 dark:bg-gray-900/50 p-4"
            >
              <div className="font-medium text-foreground">
                {item.title}
                {item.subtitle ? (
                  <span className="text-muted-foreground font-normal"> · {item.subtitle}</span>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {item.reason || t(key("fitNoReason"))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {plan.exhausted && (
        <p className="text-xs text-muted-foreground">
          {t(key("fitExhausted"), { pages: plan.pagesAfter })}
        </p>
      )}

      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <Button variant="outline" onClick={onKeepAll}>
          {t(key("fitKeepAll"))}
        </Button>
        <Button onClick={onApply}>{t(key("fitApply"))}</Button>
      </div>
    </div>
  );
};
