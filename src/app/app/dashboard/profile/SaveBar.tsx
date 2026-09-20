import { AlertTriangle, Check, HardDrive, Loader2, Save } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useSavesSession } from "@/hooks/useSavesSession";
import { save } from "@/lib/saves/session";
import { Button } from "@/components/ui/button";

/**
 * 底部保存栏。
 *
 * **它报告的是磁盘存档的真实状态**，不是"档案最后一次被改动"那种似是而非的时间戳
 * （改前那个「已保存 HH:MM」取的是 `profile.meta.updatedAt`，与有没有写到磁盘无关）。
 *
 * 从 S3 起**没有自动写盘**：编辑只留在浏览器里，写盘发生在五个明确时机上
 * （点这里 / 切用户 / 关编辑器 / 页面隐藏 / 应用内离开，见 `plan/saves-design.md` §5）。
 * 所以这一行现在是**真信息**：有 N 处没落盘就写着 N 处。
 *
 * 相位为 `loading`（还没问到能不能存）时不显示任何状态 —— 那时候说什么都是猜的。
 */
export const SaveBar = () => {
  const t = useTranslations("profile");
  const session = useSavesSession();

  const dirtyCount = session.dirtyOps.length;

  const view = (():
    | { icon: "ok" | "busy" | "warn" | "off" | "dirty"; text: string }
    | null => {
    if (session.phase === "loading") return null;
    if (session.phase === "local-only") return { icon: "off", text: t("save.diskDisabled") };
    if (session.saving) return { icon: "busy", text: t("save.diskWriting") };
    if (session.error) {
      // 服务端的原文比一句"失败了"有用得多（例如「内容超过 4194304 字节上限」）
      return { icon: "warn", text: `${t("save.diskFailed")}：${session.error}` };
    }
    if (dirtyCount > 0) return { icon: "dirty", text: t("save.unsavedCount", { count: dirtyCount }) };
    return { icon: "ok", text: t("save.diskSynced") };
  })();

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-background/95 px-6 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        {view?.icon === "busy" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        {view?.icon === "ok" && (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        {view?.icon === "dirty" && <Save className="h-3.5 w-3.5 shrink-0 text-primary" />}
        {view?.icon === "warn" && (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        )}
        {view?.icon === "off" && <HardDrive className="h-3.5 w-3.5 shrink-0 opacity-60" />}
        <span className="truncate">{view?.text ?? ""}</span>
      </div>

      {session.phase === "ready" && (
        <Button
          variant={dirtyCount > 0 ? "default" : "outline"}
          size="sm"
          disabled={session.saving}
          onClick={() => void save()}
          className="shrink-0"
        >
          <Save className="mr-2 h-4 w-4" />
          {dirtyCount > 0 ? t("save.saveNow") : t("save.button")}
        </Button>
      )}
    </div>
  );
};
