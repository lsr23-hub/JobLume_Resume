import { useEffect, useState } from "react";
import { IconResumes, IconTemplates, IconSettings, IconAI, IconProfile, IconTarget } from "@/components/shared/icons/SidebarIcons";
import { usePathname, useRouter } from "@/lib/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import Logo from "@/components/shared/Logo";
import { useLocale, useTranslations } from "@/i18n/compat/client";
import { CurrentUserChip } from "./CurrentUserChip";
import { useSavesSession } from "@/hooks/useSavesSession";
import { guardLeave } from "@/lib/saves/leaveGuard";
import { LeaveDialog } from "@/components/shared/LeaveDialog";
import { ConflictDialog } from "@/components/shared/ConflictDialog";
import { SyncStatusBadge } from "@/components/shared/SyncStatusBadge";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

interface MenuItem {
  title: string;
  url?: string;
  href?: string;
  icon: any;
}

const SidebarNavItem = ({
  item,
  active,
  open,
  onClick,
}: {
  item: MenuItem;
  active: boolean;
  open: boolean;
  onClick: () => void;
}) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    setTooltipOpen(false);
  }, [open]);

  return (
    <TooltipProvider
      delayDuration={300}
      skipDelayDuration={0}
      disableHoverableContent
    >
      <Tooltip
        open={!open && tooltipOpen}
        onOpenChange={setTooltipOpen}
      >
        <SidebarMenuItem>
          <TooltipTrigger asChild>
            <SidebarMenuButton
              isActive={active}
              onClick={onClick}
              aria-label={item.title}
              className={cn(
                "mb-1 gap-2 transition-colors duration-200 [&>svg]:!size-6",
                open ? "h-12 w-full px-4" : "h-10 w-10 p-0",
                active
                  ? "bg-primary/10 text-primary font-bold hover:bg-primary/20 hover:text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon size={24} active={active} />
              <span
                className={cn(
                  "min-w-0 overflow-hidden whitespace-nowrap text-sm transition-opacity duration-200",
                  open ? "flex-1 text-left" : "w-0 opacity-0"
                )}
                aria-hidden={!open}
              >
                {item.title}
              </span>
            </SidebarMenuButton>
          </TooltipTrigger>
        </SidebarMenuItem>
        {!open && (
          <TooltipContent
            side="right"
            className="font-medium data-[state=closed]:!animate-none"
          >
            {item.title}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
};

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  // 把 store 的改动防抖镜像到磁盘上的 saves/<userId>/（编辑器那边另挂一次）
  useSavesSession();

  const t = useTranslations("dashboard");
  const sidebarItems: MenuItem[] = [
    {
      title: t("sidebar.profile"),
      url: "/app/dashboard/profile",
      icon: IconProfile,
    },
    {
      title: t("sidebar.resumes"),
      url: "/app/dashboard/resumes",
      icon: IconResumes,
    },
    {
      title: t("sidebar.targets"),
      url: "/app/dashboard/targets",
      icon: IconTarget,
    },
    {
      title: t("sidebar.templates"),
      url: "/app/dashboard/templates",
      icon: IconTemplates,
    },
    {
      title: t("sidebar.ai"),
      url: "/app/dashboard/ai",
      icon: IconAI,
    },
    {
      title: t("sidebar.settings"),
      url: "/app/dashboard/settings",
      icon: IconSettings,
    },

  ];

  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [open, setOpen] = useState(true);

  const handleItemClick = (item: MenuItem) => {
    // 时机 ⑤：有未落盘的改动就先问一句。**干净的导航直接放行**，没有等待感
    void guardLeave(() => router.push(item.url || item.href || "/"));
  };

  const isItemActive = (item: MenuItem) =>
    item.url === pathname || item.href === pathname;

  return (
    <div className="flex h-screen bg-background">
      <SidebarProvider open={open} onOpenChange={setOpen}>
        <Sidebar
          collapsible="icon"
          className="border-r border-border/40 bg-card/50 backdrop-blur-xl"
        >
          <SidebarHeader className="h-16 flex items-center justify-center border-b border-border/40">
            <div className="w-full cursor-pointer justify-center flex items-center gap-2.5" onClick={() => void guardLeave(() => router.push(`/${locale}`))}
            >
              {/* 新标识是通体填满画布的三角+J，同样的盒子比原来的方形徽标
                  视觉重量大得多；36px 让它与 18px 的品牌名保持导航栏的
                  比例（30/15），48px 会压过文字。 */}
              <Logo
                className="hover:opacity-80 transition-opacity"
                size={36}
              />
              <span
                className={cn(
                  "min-w-0 overflow-hidden whitespace-nowrap font-bold text-lg tracking-tight transition-[opacity] duration-200",
                  !open && "opacity-0"
                )}
              >
                {t("sidebar.appName")}
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-4 group-data-[collapsible=icon]:px-0">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {sidebarItems.map((item) => {
                    const active = isItemActive(item);
                    return (
                      <SidebarNavItem
                        key={item.title}
                        item={item}
                        active={active}
                        open={open}
                        onClick={() => handleItemClick(item)}
                      />
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-1 transition-[gap] duration-200 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
              <div className="min-w-0 flex-1 transition-[width] duration-200 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex-none">
                <CurrentUserChip />
              </div>
              {/* 写盘出问题时才出现（见组件头注释） */}
              <SyncStatusBadge />
              {/* 工作台此前没有任何明暗切换入口 —— 只有编辑器头部有 */}
              <ThemeToggle mode="toggle" />
            </div>
          </SidebarFooter>
        </Sidebar>
        {/* min-w-0 是必需的：flex item 默认 min-width:auto，不加则无法收缩到
            内容 min-content 宽度以下 —— 窄屏下内部任何 nowrap 内容都会撑破整页 */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="p-2">
            <SidebarTrigger />
          </div>
          {/* min-h-0 与上面那条 min-w-0 是同一类问题的高度版本：flex item 默认
              min-height:auto，不肯缩到内容高度以下。缺了它，内容比视口高时这个
              div 会跟着长高、溢出 h-screen 的根容器，文档随之出现滚动条 ——
              而多出来的那段露在 html 上，不是 body 的背景。
              职业数据库内容一多就能看见底部漏出一条白。 */}
          <div className="flex-1 min-h-0">{children}</div>
          {/* 离开守卫的对话框。挂在这里：侧边栏的导航都从这个外壳发起 */}
          <LeaveDialog />
          {/* 对账冲突。启动时读回磁盘数据后可能弹出来 */}
          <ConflictDialog />
        </main>
      </SidebarProvider>
    </div>
  );
};

export default DashboardLayout;
