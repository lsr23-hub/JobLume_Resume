import { useEffect, useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { Button } from "@/components/ui/button";

/**
 * 底部保存栏。
 *
 * **说明**：数据在每次编辑时已由 zustand persist 同步写入 localStorage，
 * 切换板块、刷新页面都不会丢。这个按钮不是「不点就丢」的必需步骤 ——
 * 它的作用是给用户一个明确的落盘确认。
 *
 * 点击时用一个新对象引用触发 persist 再写一次（不依赖其内部存储格式）。
 */
export const SaveBar = () => {
  const t = useTranslations("profile");
  const profile = useCareerProfileStore((s) => s.profile);
  const [flash, setFlash] = useState(false);

  const savedAt = profile?.meta.updatedAt;

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(timer);
  }, [flash]);

  const handleSave = () => {
    const current = useCareerProfileStore.getState().profile;
    if (!current) {
      toast.error(t("save.failed"));
      return;
    }

    try {
      // 新引用触发 persist 中间件再写一次；不直接拼 storage 格式，
      // 避免与 zustand 内部结构耦合
      useCareerProfileStore.setState({ profile: { ...current } });
      setFlash(true);
      toast.success(t("save.success"));
    } catch {
      toast.error(t("save.failed"));
    }
  };

  const timeLabel = savedAt
    ? new Date(savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {flash ? (
          <>
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span>{t("save.saving")}</span>
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">
              {timeLabel ? `${t("save.saved")} ${timeLabel}` : t("save.never")}
            </span>
          </>
        )}
        <span className="hidden truncate text-xs opacity-70 sm:inline">{t("save.autoNote")}</span>
      </div>

      <Button variant="outline" size="sm" onClick={handleSave} className="shrink-0">
        <Save className="mr-2 h-4 w-4" />
        {t("save.button")}
      </Button>
    </div>
  );
};
