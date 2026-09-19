import { useTranslations } from "@/i18n/compat/client";

/**
 * 深色带 —— 规格里深色面是用来承载产品态与硬信息的，
 * 这里放产品最需要说清的一条边界：AI 只判定，不改写。
 *
 * 珊瑚色在这里不出现：规格要求珊瑚「只在主 CTA 与整幅珊瑚卡上」，
 * 深色带上的标记点用 accent-teal。
 */
const JudgementBand = () => {
  const t = useTranslations("home");
  const points = [1, 2, 3] as const;

  // 暗色主题下 canvas 与 surface-dark 取值相同，这道极淡的描边是让深色带
  // 在暗色模式里仍读得出分区；亮色模式下它落在深底上，看不见。
  return (
    <section id="judgement" className="border-y border-white/[0.06] bg-surface-dark">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <p className="text-[12px] font-medium uppercase tracking-[1.5px] text-on-dark-soft">
          {t("judgement.eyebrow")}
        </p>
        <h2 className="mt-4 max-w-[46rem] font-serif text-[32px] font-normal leading-[1.15] tracking-[-0.5px] text-on-dark sm:text-[36px]">
          {t("judgement.title")}
        </h2>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {points.map((n) => (
            <div key={n} className="border-t border-white/[0.08] pt-6">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-teal" />
              <h3 className="mt-4 text-[18px] font-medium leading-[1.4] text-on-dark">
                {t(`judgement.point${n}.title`)}
              </h3>
              <p className="mt-2.5 text-[14px] leading-[1.55] text-on-dark-soft">
                {t(`judgement.point${n}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default JudgementBand;
