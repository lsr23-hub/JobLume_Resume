import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import Logo from "@/components/shared/Logo";
import LanguageSwitch from "@/components/shared/LanguageSwitch";
import { Button } from "@/components/ui/button";

/**
 * 顶部导航 —— 规格：canvas 底、64px 高、右侧一枚珊瑚色主 CTA。
 *
 * 菜单项在窄屏隐藏（规格的折叠策略是收成汉堡菜单；这里页面短、
 * 锚点也少，直接隐去比再做一个抽屉更省），CTA 始终保留。
 */
const LINKS = [
  { href: "#features", key: "nav.features" },
  { href: "#judgement", key: "nav.judgement" },
  { href: "#templates", key: "nav.templates" },
] as const;

const SiteNav = () => {
  const t = useTranslations("home");
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <Logo size={30} />
          <span className="text-[15px] font-medium tracking-tight text-ink">
            {t("brand")}
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[14px] font-medium text-muted-ink transition-colors hover:text-ink"
            >
              {t(link.key)}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <LanguageSwitch />
          <Button
            size="sm"
            className="h-9 rounded-md bg-coral px-4 text-[14px] font-medium text-on-primary hover:bg-coral-active"
            onClick={() => router.push("/app/dashboard")}
          >
            {t("nav.enter")}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default SiteNav;
