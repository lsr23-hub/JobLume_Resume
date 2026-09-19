import { createFileRoute, notFound } from "@tanstack/react-router";
import LandingPage from "@/app/(public)/[locale]/page";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { absoluteUrl } from "@/config/site";
import zhMessages from "@/i18n/locales/zh.json";
import enMessages from "@/i18n/locales/en.json";

function resolveLocale(rawLocale: string): Locale {
  if (locales.includes(rawLocale as Locale)) {
    return rawLocale as Locale;
  }
  return defaultLocale;
}

function getLocaleSeo(locale: Locale) {
  const messages = locale === "en" ? enMessages : zhMessages;
  const title = `${messages.common.title} - ${messages.common.subtitle}`;
  const description = messages.common.description;
  const localeTag = locale === "en" ? "en_US" : "zh_CN";
  // 未配置站点地址时为 null —— 调用方据此整体省略绝对 URL 标签
  const canonical = absoluteUrl(`/${locale}`);
  const alternateLocale = locale === "en" ? "zh" : "en";

  return {
    title,
    description,
    localeTag,
    canonical,
    alternateLocale
  };
}

export const Route = createFileRoute("/$locale")({
  head: ({ params }) => {
    const locale = resolveLocale(params.locale);
    const seo = getLocaleSeo(locale);

    const ogImage = absoluteUrl("/web-shot.png");
    const alternate = absoluteUrl(`/${seo.alternateLocale}`);
    const xDefault = absoluteUrl(`/${defaultLocale}`);

    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { name: "robots", content: "index,follow" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "职光简历" },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:locale", content: seo.localeTag },
        ...(seo.canonical ? [{ property: "og:url", content: seo.canonical }] : []),
        ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: seo.title },
        { name: "twitter:description", content: seo.description },
        ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : [])
      ],
      // 绝对 URL 要求站点地址已配置；没配置就整组省略，而不是输出相对路径 ——
      // canonical 必须是绝对地址，相对值会被搜索引擎忽略或误判。
      links:
        seo.canonical && alternate && xDefault
          ? [
              { rel: "canonical", href: seo.canonical },
              { rel: "alternate", hrefLang: locale, href: seo.canonical },
              { rel: "alternate", hrefLang: seo.alternateLocale, href: alternate },
              { rel: "alternate", hrefLang: "x-default", href: xDefault }
            ]
          : []
    };
  },
  component: LocaleLandingPage
});

function LocaleLandingPage() {
  const { locale } = Route.useParams();

  if (!locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  return <LandingPage />;
}
