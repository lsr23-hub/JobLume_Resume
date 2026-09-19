import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation
} from "@tanstack/react-router";
import appCss from "../app/globals.css?url";
import appFontCss from "../app/font.css?url";
import tiptapCss from "../styles/tiptap.scss?url";
import { NextIntlClientProvider } from "@/i18n/compat/client";
import { useEffect } from "react";
import zhMessages from "@/i18n/locales/zh.json";
import enMessages from "@/i18n/locales/en.json";
import { Providers } from "@/app/providers";
import { Toaster } from "@/components/ui/sonner";
import { getPreferredLocale } from "@/i18n/runtime";
import { ReactGrab } from "@/components/dev/ReactGrab";

/**
 * 首屏预加载的字体。
 *
 * 只预加载**默认字体**（Alibaba PuHuiTi）的两个字重 —— 它们是首次渲染就要用的。
 * 其余三个字族按需加载（用户选了才拉，见 `utils/fonts.ts`）。
 *
 * ⚠️ 扩展名与 `type` 必须与 `public/fonts/` 下实际的产物一致：那里放的是
 * **子集化后的 WOFF2**，不是原始 TTF/OTF（见 `pnpm subset:fonts`）。
 * 写错的话预加载会 404 且控制台只留一行 warning，字体静默回退。
 */
const defaultFontPreloadLinks = [
  {
    rel: "preload",
    href: "/fonts/AlibabaPuHuiTi-3-55-Regular.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous" as const
  },
  {
    rel: "preload",
    href: "/fonts/AlibabaPuHuiTi-3-85-Bold.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous" as const
  }
];

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      },
      { title: "职光简历" }
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss
      },
      {
        rel: "stylesheet",
        href: appFontCss
      },
      {
        rel: "stylesheet",
        href: tiptapCss
      },
      ...defaultFontPreloadLinks
    ]
  }),
  component: RootComponent,
  notFoundComponent: RootNotFound
});

function RootComponent() {
  const pathname = useLocation({
    select: (location) => location.pathname
  });
  const locale = getPreferredLocale(pathname);
  const messages = locale === "en" ? enMessages : zhMessages;

  useEffect(() => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
  }, [locale]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body>
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="Asia/Shanghai"
        >
          <Providers>
            <ReactGrab />
            <Outlet />
            <Toaster position="top-center" richColors />
          </Providers>
        </NextIntlClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">页面不存在</p>
    </main>
  );
}
