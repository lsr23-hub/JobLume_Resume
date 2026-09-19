import * as React from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** 系统是否要求减少动态效果 */
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** View Transitions 是否可用（Firefox / 旧 Safari 没有） */
const canTransition = () =>
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
    "function" &&
  !prefersReducedMotion();

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

/**
 * 切主题，并在支持的浏览器上播「从点击处圆形扩散」的动画。
 *
 * 三条必须守住的：
 * - **不支持就静默降级**成普通切换。动画是锦上添花，不能成为切主题的前提。
 * - **尊重 `prefers-reduced-motion`**。
 * - `setTheme` 要包在 `flushSync` 里。View Transitions 在回调返回后立刻截新帧，
 *   而 React 18 的状态更新是异步批处理的 —— 不强制同步刷新的话，截到的还是旧帧，
 *   表现为「动画播了但内容没变」，比不做动画还糟。
 */
const useThemedSwitch = () => {
  const { setTheme } = useTheme();

  return React.useCallback(
    (next: string, event?: { clientX: number; clientY: number }) => {
      const doc = document as DocWithVT;

      if (!event || !canTransition() || !doc.startViewTransition) {
        setTheme(next);
        return;
      }

      const root = document.documentElement;
      root.style.setProperty("--theme-x", `${event.clientX}px`);
      root.style.setProperty("--theme-y", `${event.clientY}px`);

      doc.startViewTransition(() => {
        flushSync(() => setTheme(next));
      });
    },
    [setTheme]
  );
};

interface Props {
  children?: React.ReactNode;
  /**
   * `menu`（默认）：下拉，可选 light / dark / system，编辑器在用。
   * `toggle`：单击直接在明暗之间切，工作台用 —— 那里切主题是高频动作，
   *   不该为了换个颜色点两次。
   */
  mode?: "menu" | "toggle";
}

const ThemeToggle = ({ children, mode = "menu" }: Props) => {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const switchTheme = useThemedSwitch();

  // 主题要等挂载后才能读到（服务端不知道用户选了什么），否则首帧图标会闪
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return mode === "toggle" ? (
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled />
    ) : null;
  }

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = currentTheme === "dark";

  const icon = (
    <>
      <Sun
        className={cn(
          "h-[1.2rem] w-[1.2rem] transition-all duration-500",
          isDark ? "-rotate-90 scale-0" : "rotate-0 scale-100"
        )}
      />
      <Moon
        className={cn(
          "absolute h-[1.2rem] w-[1.2rem] transition-all duration-500",
          isDark ? "rotate-0 scale-100" : "rotate-90 scale-0"
        )}
      />
    </>
  );

  if (mode === "toggle") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8 shrink-0 overflow-hidden"
        aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
        onClick={(e) => switchTheme(isDark ? "light" : "dark", e)}
      >
        {icon}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {!children ? (
          <Button
            variant="outline"
            size="icon"
            className="relative overflow-hidden"
          >
            {icon}
            <span className="sr-only">Toggle theme</span>
          </Button>
        ) : (
          children
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(["light", "dark", "system"] as const).map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={(e) => switchTheme(value, e)}
          >
            {value === "light" ? "Light" : value === "dark" ? "Dark" : "System"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
