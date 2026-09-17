import { Download } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { buildProfileArchive } from "@/lib/backup";
import { downloadBlob } from "@/utils/export";
import { Button } from "@/components/ui/button";

/**
 * 把职业数据库单独另存为文件。
 *
 * 只导出数据库本身，不含简历与投递目标 —— 需要整库时用「通用设置」里的
 * 备份功能。导入端两种格式都认（见 `parseProfileArchive`）。
 */
export const ExportProfileButton = () => {
  const t = useTranslations("profile");
  const profile = useCareerProfileStore((s) => s.profile);

  const handleExport = () => {
    if (!profile) return;

    const now = new Date().toISOString();
    const archive = buildProfileArchive(profile, now);
    downloadBlob(
      new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" }),
      `joblume-profile-${now.slice(0, 19).replace(/[:T]/g, "-")}.json`
    );
    toast.success(t("export.success"));
  };

  return (
    <Button variant="outline" onClick={handleExport} className="shrink-0">
      <Download className="mr-2 h-4 w-4" />
      {t("export.button")}
    </Button>
  );
};
