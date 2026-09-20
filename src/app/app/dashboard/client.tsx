import { useState } from "react";
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
import { SyncStatusBadge } from "@/components/shared/SyncStatusBadge";
import ThemeToggle from "@/components/shared/ThemeToggle";

interface MenuItem {
  title: string;
  url?: string;
  href?: string;
  icon: any;
}

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
              {open && (
                <span className="font-bold text-lg tracking-tight">
                  {t("sidebar.appName")}
                </span>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 py-4">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {sidebarItems.map((item) => {
                    const active = isItemActive(item);
                    return (
                      <TooltipProvider delayDuration={0} key={item.title}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton
                                asChild
                                isActive={active}
                                className={`w-full transition-all duration-200 ease-in-out h-12 mb-1 [&>svg]:size-auto ${active
                                  ? "bg-primary/10 text-primary font-bold hover:bg-primary/20 hover:text-primary"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                  }`}
                              >
                                <div
                                  className="flex items-center gap-2 px-2 cursor-pointer"
                                  onClick={() => handleItemClick(item)}
                                >
                                  <item.icon
                                    size={24}
                                    active={active}
                                  />
                                  {open && (
                                    <span className="flex-1 text-sm">
                                      {item.title}
                                    </span>
                                  )}
                                </div>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          </TooltipTrigger>
                          {!open && (
                            <TooltipContent side="right" className="font-medium">
                              {item.title}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
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
        </main>
      </SidebarProvider>
    </div>
  );
};

export default DashboardLayout;
