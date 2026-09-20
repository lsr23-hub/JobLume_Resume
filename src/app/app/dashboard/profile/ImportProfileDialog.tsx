import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { useResumeStore } from "@/store/useResumeStore";
import { buildBackup, parseProfileArchive } from "@/lib/backup";
import { hasUsableProfile } from "@/lib/profile/hasUsableProfile";
import type { CareerProfile } from "@/types/profile";
import { downloadBlob } from "@/utils/export";
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
 * 导入职业数据库。
 *
 * 覆盖是不可撤销的，因此当库中已有内容时先问一句是否存档 ——
 * 不问就直接替换等于把用户积累的数据置于风险中。
 */
export const ImportProfileDialog = () => {
  const t = useTranslations("profile");
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<CareerProfile | null>(null);

  const { profile, replaceProfile } = useCareerProfileStore();
  const { targets } = useJobTargetStore();
  const resumes = useResumeStore((s) => s.resumes);

  const applyImport = (next: CareerProfile) => {
    replaceProfile(next);
    setPending(null);
    toast.success(t("import.success"));
  };

  const handleFile = async (file: File) => {
    const parsed = parseProfileArchive(await file.text());
    if (!parsed.ok) {
      toast.error(t("import.invalid"), { description: parsed.error });
      return;
    }
    // 空库直接替换，不必打扰用户。
    //
    // ⚠️ 判定必须用 `hasUsableProfile`（与 store 迁移、生成简历向导共用同一份）。
    // 这里原本有一份只看「姓名 + 条目」的本地判定，于是**只有技能分组 / 证书奖项 /
    // 语言能力 / 自我评价的库会被判成空库 → 直接替换、不问、也不给存档机会**，
    // 而那几项恰恰是最难重建的（技能分组是手工排出来的）。
    if (!hasUsableProfile(profile)) {
      applyImport(parsed.profile);
      return;
    }
    setPending(parsed.profile);
  };

  const archiveCurrent = () => {
    const now = new Date().toISOString();
    // 存全库而非只存数据库 —— 用户更可能想保住的是「所有东西」
    const payload = buildBackup({ profile, resumes, targets, now });
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      `joblume-backup-${now.slice(0, 19).replace(/[:T]/g, "-")}.json`
    );
  };

  return (
    <>
      <Button variant="outline" onClick={() => inputRef.current?.click()} className="shrink-0">
        <Upload className="mr-2 h-4 w-4" />
        {t("import.button")}
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("import.askArchive")}</AlertDialogTitle>
            <AlertDialogDescription>{t("import.archiveHint")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>{t("import.cancel")}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                archiveCurrent();
                toast.info(t("import.archived"));
                if (pending) applyImport(pending);
              }}
            >
              {t("import.yes")}
            </Button>
            <AlertDialogAction
              onClick={() => pending && applyImport(pending)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("import.no")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
