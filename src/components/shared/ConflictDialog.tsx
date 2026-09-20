import { useTranslations } from "@/i18n/compat/client";
import { useSavesSession } from "@/hooks/useSavesSession";
import { resolveConflict } from "@/lib/saves/session";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useResumeStore } from "@/store/useResumeStore";
import type { ConflictItem } from "@/lib/saves/reconcile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 启动对账发现冲突时逐条问用户（`plan/saves-design.md` §4）。
 *
 * 冲突 = **两边都改过，而且改得不一样**。这是唯一会丢数据的路径，所以刻意不做任何
 * 自动选择（不问就按某一边覆盖，另一边就永远回不来了）。
 *
 * **关不掉**（没有 X、Esc 与点遮罩无效）：关掉之后那些条目既不在脏集里、又回不到这个
 * 对话框，用户会卡在"这几条永远存不上、还找不到原因"。逐条选一个是必须走完的。
 */
export const ConflictDialog = () => {
  const t = useTranslations();
  const session = useSavesSession();
  const resumes = useResumeStore((s) => s.resumes);
  const targets = useJobTargetStore((s) => s.targets);

  if (session.conflicts.length === 0) return null;

  /** 说清是哪一条 —— 光给个 key 用户没法判断 */
  const labelOf = (item: ConflictItem): string => {
    if (item.kind === "profile") return t("sync.recordProfile");
    if (item.kind === "resume") {
      const title = item.id ? resumes[item.id]?.title?.trim() : "";
      return `${t("sync.recordResume")}${title ? `《${title}》` : ""}`;
    }
    const jd = item.id ? targets[item.id] : undefined;
    const name = [jd?.company, jd?.position].filter(Boolean).join(" · ");
    return `${t("sync.recordJd")}${name ? `：${name}` : ""}`;
  };

  return (
    <Dialog open>
      <DialogContent hideClose className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sync.conflictTitle", { count: session.conflicts.length })}</DialogTitle>
          <DialogDescription>{t("sync.conflictHint")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {session.conflicts.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3"
            >
              <span className="min-w-0 truncate text-sm font-medium">{labelOf(item)}</span>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void resolveConflict(item.key, "disk")}
                >
                  {t("sync.keepDisk")}
                </Button>
                <Button size="sm" onClick={() => void resolveConflict(item.key, "local")}>
                  {t("sync.keepLocal")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConflictDialog;
