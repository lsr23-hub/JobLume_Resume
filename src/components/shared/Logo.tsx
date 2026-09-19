import React from "react";
import { cn } from "@/lib/utils";
import {
  BRAND_ACCENT,
  LOGO_ACCENT_PATH,
  LOGO_INK_PATH,
  LOGO_VIEWBOX,
} from "./logoMark";

interface LogoProps {
  /** 渲染边长（px）。 */
  size?: number;
  className?: string;
  onClick?: () => void;
  /** 无障碍文本。标识旁边已经写了品牌名时传 ""，把它降级为装饰元素。 */
  alt?: string;
}

/**
 * 品牌标识：JL 字母组合。
 *
 * 用内联 SVG 而不是 <img>，是因为深色那半走 currentColor：同一份资源
 * 在浅色导航、深色主题侧栏、以及两种主题下都保持深色的页脚上都能自动
 * 取到正确的墨色，调用方不必关心主题，也不需要维护第二套反白资源。
 * 颜色 = 父级文字色，默认 --ink；页脚那类恒定深色面传 text-on-dark 覆盖。
 *
 * 路径数据见 ./logoMark.ts。
 */
const Logo: React.FC<LogoProps> = ({
  size = 100,
  className = "",
  onClick,
  alt = "职光简历",
}) => {
  const decorative = alt === "";

  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      width={size}
      height={size}
      onClick={onClick}
      className={cn(
        "inline-block shrink-0 select-none align-middle text-ink",
        className
      )}
      {...(decorative
        ? { "aria-hidden": true as const }
        : { role: "img" as const, "aria-label": alt })}
    >
      <path fill={BRAND_ACCENT} d={LOGO_ACCENT_PATH} />
      <path fill="currentColor" d={LOGO_INK_PATH} />
    </svg>
  );
};

export default Logo;
