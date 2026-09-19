import { useTranslations } from "@/i18n/compat/client";
import { cn } from "@/lib/utils";

/**
 * 英雄区右侧的实景卡 —— 展示的是产品真实的那一屏：JD 要求逐条对照。
 *
 * 设计规格里有一句明确的偏好：「用真实产品 chrome，别画营销插画」，
 * 所以这里不是示意图，是照着投递目标页的要求项列表复刻的。
 */

type Status = "covered" | "weak" | "missing";

const DOT: Record<Status, string> = {
  covered: "bg-success",
  weak: "bg-warning",
  missing: "bg-on-dark-soft/40",
};

const CHIP: Record<Status, string> = {
  covered: "bg-success/15 text-success",
  weak: "bg-warning/15 text-warning",
  missing: "bg-on-dark-soft/15 text-on-dark-soft",
};

const RequirementRow = ({
  status,
  text,
  evidence,
  chip,
}: {
  status: Status;
  text: string;
  evidence: string;
  chip: string;
}) => (
  <li className="rounded-md bg-surface-dark-soft px-4 py-3">
    <div className="flex items-start gap-3">
      <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", DOT[status])} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug text-on-dark">{text}</p>
        <p className="mt-1 text-[12px] leading-snug text-on-dark-soft">{evidence}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
          CHIP[status]
        )}
      >
        {chip}
      </span>
    </div>
  </li>
);

const ProductMockup = () => {
  const t = useTranslations("home");

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-dark p-6 shadow-[0_20px_60px_-30px_rgba(20,20,19,0.5)] sm:p-8">
      {/* 卡片头：这一屏是哪个岗位 */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent-teal" />
          <span className="truncate text-[13px] font-medium text-on-dark-soft">
            {t("mockup.target")}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-surface-dark-elevated px-3 py-1 text-[12px] font-medium tracking-[1.5px] text-on-dark-soft">
          {t("mockup.analyzed")}
        </span>
      </div>

      <ul className="space-y-2.5">
        <RequirementRow
          status="covered"
          text={t("mockup.item1")}
          evidence={t("mockup.item1Evidence")}
          chip={t("mockup.covered")}
        />
        <RequirementRow
          status="weak"
          text={t("mockup.item2")}
          evidence={t("mockup.item2Evidence")}
          chip={t("mockup.weak")}
        />
        <RequirementRow
          status="missing"
          text={t("mockup.item3")}
          evidence={t("mockup.item3Evidence")}
          chip={t("mockup.missing")}
        />
      </ul>

      <p className="mt-5 border-t border-white/[0.06] pt-4 text-[12px] leading-relaxed text-on-dark-soft">
        {t("mockup.note")}
      </p>
    </div>
  );
};

export default ProductMockup;
