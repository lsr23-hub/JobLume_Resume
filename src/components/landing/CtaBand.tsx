import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

/**
 * 页脚前的珊瑚色 CTA 卡 —— 规格的 cta-band-coral：
 * 整幅珊瑚底、48–64px 内边距，卡内的按钮**反相**成奶油底。
 */
const CtaBand = () => {
  const t = useTranslations("home");
  const router = useRouter();

  return (
    <section className="bg-canvas">
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="rounded-lg bg-coral px-8 py-14 sm:px-16 sm:py-16">
          <h2 className="max-w-[34rem] font-serif text-[28px] font-normal leading-[1.2] tracking-[-0.3px] text-on-primary">
            {t("cta.title")}
          </h2>
          <p className="mt-4 max-w-[34rem] text-[16px] leading-[1.55] text-on-primary/85">
            {t("cta.description")}
          </p>
          <Button
            className="mt-8 h-10 rounded-md bg-canvas px-5 text-[14px] font-medium text-ink hover:bg-surface-soft"
            onClick={() => router.push("/app/dashboard")}
          >
            {t("cta.button")}
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CtaBand;
