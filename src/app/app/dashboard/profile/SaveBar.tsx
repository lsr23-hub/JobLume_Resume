import { AlertTriangle, Check, HardDrive, Loader2, Save } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useSavesSyncStatus } from "@/hooks/useSavesSyncStatus";
import { flushNow } from "@/hooks/useSavesMirror";
import { Button } from "@/components/ui/button";

/**
 * 底部保存栏。
 *
 * **这一行报告的是磁盘镜像的真实状态**，不再拿 `profile.meta.updatedAt` 冒充
 * 「已保存 HH:MM」—— 那个时间戳的含义是「档案最后一次被改动」，与有没有写到磁盘
 * 无关，而原来的文案会让用户以为那是落盘时间。
 *
 * 按钮 = **立刻写盘**：先 `touchProfile()` 换一个新引用（让差分认出这次改动），
 * 再 `flushNow()` 跳过防抖直接提交。结果由状态行如实反映；失败不再只 `console.warn`。
 *
 * 边界说明：`beforeunload` 的文案与按钮由浏览器固定（规范禁止自定义），所以
 * 「未保存时会拦一下」这件事做不到这里 —— 那是 S3/S4 的内容，见
 * `plan/saves-design.md` §5、§10。
 */
export const SaveBar = () => {
  const t = useTranslations("profile");
  const status = useSavesSyncStatus();

  const handleSave = () => {
    // touchProfile 内部已保证「没有当前用户就什么都不做」，这里不必再判一次
    useCareerProfileStore.getState().touchProfile();
    flushNow();
  };

  const { icon, text } = (():
    | { icon: "busy" | "ok" | "warn" | "off"; text: string } => {
    switch (status.phase) {
      case "syncing":
        return { icon: "busy", text: t("save.diskWriting") };
      case "failed":
        return { icon: "warn", text: t("save.diskFailed") };
      case "stopped":
        return { icon: "warn", text: t("save.diskStopped") };
      case "disabled":
        return { icon: "off", text: t("save.diskDisabled") };
      default:
        // 有排队但还没轮到 flush（防抖窗口内）时，对外与"正在写"是同一种状态
        return status.pendingCount > 0
          ? { icon: "busy", text: t("save.diskWriting") }
          : { icon: "ok", text: t("save.diskSynced") };
    }
  })();

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {icon === "busy" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        {icon === "ok" && (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        {icon === "warn" && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        {icon === "off" && <HardDrive className="h-3.5 w-3.5 shrink-0 opacity-60" />}

        {/* lastError 挂成 title：出问题时鼠标一悬停就能看到服务端原文，
            平时不占地方 */}
        <span className="truncate" title={status.lastError ?? undefined}>
          {text}
        </span>
      </div>

      <Button variant="outline" size="sm" onClick={handleSave} className="shrink-0">
        <Save className="mr-2 h-4 w-4" />
        {t("save.button")}
      </Button>
    </div>
  );
};
