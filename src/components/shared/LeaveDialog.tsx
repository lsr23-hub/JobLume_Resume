import { useSyncExternalStore } from "react";
import { useTranslations } from "@/i18n/compat/client";
import {
  getPendingLeave,
  resolveLeave,
  subscribePendingLeave,
} from "@/lib/saves/leaveGuard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * 有未落盘的改动、而用户正要离开时，问一句（时机 ⑤）。
 *
 * **没有未落盘的改动时它什么都不做** —— 守卫那边就放行了，不会走到这里。
 *
 * 三个选项的诚实含义（与设计文档 §5 的措辞不同，理由见 `leaveGuard.ts`）：
 * 「保存并离开」写盘后走；「直接离开」这次不写盘、改动留在浏览器里；「取消」留下。
 */
export const LeaveDialog = () => {
  const t = useTranslations();
  const pending = useSyncExternalStore(
    subscribePendingLeave,
    getPendingLeave,
    getPendingLeave
  );

  if (!pending) return null;

  return (
    <AlertDialog open onOpenChange={(open) => !open && void resolveLeave("cancel")}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("sync.leaveTitle", { count: pending.count })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("sync.leaveHint")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>{t("sync.cancel")}</AlertDialogCancel>
          <Button variant="outline" onClick={() => void resolveLeave("leave")}>
            {t("sync.leaveWithoutSaving")}
          </Button>
          <AlertDialogAction onClick={() => void resolveLeave("save")}>
            {t("sync.saveAndLeave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LeaveDialog;
