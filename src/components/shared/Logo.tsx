import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * 占位 LOGO：方形字母徽标。
 * 待正式视觉设计产出后替换为 SVG 资源即可，调用方无需改动。
 */
const Logo: React.FC<LogoProps> = ({
  size = 100,
  className = "",
  onClick,
}) => {
  return (
    <div
      role="img"
      aria-label="职光简历"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center",
        "rounded-xl bg-primary font-bold leading-none text-primary-foreground",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
      }}
    >
      JL
    </div>
  );
};

export default Logo;
