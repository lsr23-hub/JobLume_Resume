import { useState } from "react";
import { ChevronsUpDown, UserRound } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResolvedImage } from "@/hooks/useResolvedImage";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { UserSelectDialog } from "./UserSelectDialog";

/**
 * 侧边栏底部的「当前用户」入口 —— 切换用户的唯一入口。
 *
 * 没有它就只能靠刷新页面（持久化记住了选择）来「切换」，那不叫切换。
 * 证件照是 `idb:` 引用，走 `useResolvedImage` 解析。
 */
export const CurrentUserChip = () => {
  const t = useTranslations("userSelect");
  const profile = useCareerProfileStore((s) => s.profile);
  const photo = useResolvedImage(profile?.basic?.photo);
  const { state, isMobile } = useSidebar();
  const [open, setOpen] = useState(false);

  const name = profile?.basic?.name?.trim() || t("unnamed");
  // 桌面端折叠时只剩头像
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("switchHint")}
        aria-label={t("switchHint")}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          collapsed && "justify-center"
        )}
      >
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center">
          {photo ? (
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-tight">{name}</span>
              <span className="block truncate text-[11px] text-muted-foreground leading-tight">
                {t("switchHint")}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      <UserSelectDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default CurrentUserChip;
