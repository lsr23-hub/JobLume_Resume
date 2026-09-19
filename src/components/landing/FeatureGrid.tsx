import { Database, ListChecks, ShieldCheck } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";

/**
 * 三栏功能卡 —— 规格的 feature-card：surface-card 底、12px 圆角、
 * 内部 32px 留白，顶部一枚小图标 + title-md + body-md。
 *
 * 三张卡按「数据 → 判断 → 边界」排，第三张是产品现在的真实边界：
 * AI 只判定不改写。这条不写清楚，用户会以为它像别的工具一样代写。
 */
const ICONS = [Database, ListChecks, ShieldCheck] as const;

const FeatureGrid = () => {
  const t = useTranslations("home");
  const cards = [1, 2, 3] as const;

  return (
    <section id="features" className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <h2 className="max-w-[42rem] font-serif text-[32px] font-normal leading-[1.15] tracking-[-0.5px] text-ink sm:text-[36px]">
          {t("features.title")}
        </h2>
        <p className="mt-4 max-w-[42rem] text-[16px] leading-[1.55] text-body">
          {t("features.subtitle")}
        </p>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {cards.map((n, i) => {
            const Icon = ICONS[i];
            return (
              <div key={n} className="rounded-lg bg-surface-card p-8">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-canvas text-ink">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <h3 className="mt-6 text-[18px] font-medium leading-[1.4] text-ink">
                  {t(`features.card${n}.title`)}
                </h3>
                <p className="mt-3 text-[16px] leading-[1.55] text-body">
                  {t(`features.card${n}.desc`)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeatureGrid;
