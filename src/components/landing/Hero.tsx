import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import ProductMockup from "./ProductMockup";

/**
 * 英雄区 —— 规格的 hero-band：6-6 分栏、上下 96px、左侧标题右侧产品实景。
 *
 * 标题走 display-xl（衬线 / 400 / -1.5px 字距），规格里特意强调
 * 「衬线一律 400，不要加粗」。
 */
const Hero = () => {
  const t = useTranslations("home");
  const router = useRouter();

  return (
    <section id="top" className="bg-canvas">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 py-20 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div>
          <span className="inline-block rounded-full bg-coral px-3 py-1 text-[12px] font-medium uppercase tracking-[1.5px] text-on-primary">
            {t("hero.badge")}
          </span>

          <h1 className="mt-6 font-serif text-[44px] font-normal leading-[1.05] tracking-[-1.5px] text-ink sm:text-[56px] lg:text-[64px]">
            {t("hero.title")}
          </h1>

          <p className="mt-6 max-w-[34rem] text-[16px] leading-[1.55] text-body">
            {t("hero.subtitle")}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button
              className="h-10 rounded-md bg-coral px-5 text-[14px] font-medium text-on-primary hover:bg-coral-active"
              onClick={() => router.push("/app/dashboard")}
            >
              {t("hero.cta")}
            </Button>
            <Button
              variant="outline"
              className="h-10 rounded-md border-hairline bg-canvas px-5 text-[14px] font-medium text-ink hover:bg-surface-card"
              onClick={() => router.push("/app/dashboard/templates")}
            >
              {t("hero.secondary")}
            </Button>
          </div>
        </div>

        <ProductMockup />
      </div>
    </section>
  );
};

export default Hero;
