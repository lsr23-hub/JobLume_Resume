import { ConfigProvider, theme as antdTheme } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
// antd v6 的月份 / 星期名取自 dayjs 的 localeData，只给 ConfigProvider 传 locale
// 不够 —— 不 import 这份数据，中文界面里会显示成 "Jan" / "Su Mo Tu"
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";
import { ThemeProvider, useTheme } from "next-themes";
import { HeroUIProvider } from "@heroui/react";
import { useLocale } from "@/i18n/compat/client";
import { useResumeDirectorySync } from "@/hooks/useResumeDirectorySync";

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  useResumeDirectorySync();

  return (
    <HeroUIProvider locale={locale}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem
        disableTransitionOnChange
        storageKey="magic-resume-theme"
      >
        <AntdProvider>{children}</AntdProvider>
      </ThemeProvider>
    </HeroUIProvider>
  );
}

/**
 * antd 的 ConfigProvider。
 *
 * 全部日期选择器都用 antd，默认是一套蓝色设计语言，会和 Tailwind / shadcn
 * 的主题打架，所以这里把主色、圆角、字体对齐到应用自身的 token，并跟随
 * 应用语言与明暗模式。必须放在 ThemeProvider **内部**才能读到明暗。
 */
function AntdProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <ConfigProvider
      locale={locale === "en" ? enUS : zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          // 与 globals.css 的 --primary 一致：浅色近黑、深色近白
          colorPrimary: dark ? "#fafaf5" : "#1b1b18",
          borderRadius: 6,
          fontFamily: "inherit",
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
