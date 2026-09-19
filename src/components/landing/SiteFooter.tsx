import { useTranslations } from "@/i18n/compat/client";
import Logo from "@/components/shared/Logo";

/** 页脚 —— 规格：surface-dark 收尾，64px 内边距，文字用 on-dark-soft。 */
const SiteFooter = () => {
  const t = useTranslations("home");
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surface-dark">
      <div className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="flex items-center gap-2.5">
          {/* 页脚在两种主题下都是深色面，标识的墨色固定取 on-dark。 */}
          <Logo size={28} className="text-on-dark" />
          <span className="text-[15px] font-medium text-on-dark">{t("brand")}</span>
        </div>
        <p className="mt-5 max-w-[34rem] text-[14px] leading-[1.55] text-on-dark-soft">
          {t("footer.tagline")}
        </p>
        <p className="mt-10 text-[13px] text-on-dark-soft/70">
          © {year} {t("brand")}
        </p>
      </div>
    </footer>
  );
};

export default SiteFooter;
