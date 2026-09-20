import { useRef, useState } from "react";
import { Download, HardDriveDownload, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResumeStore } from "@/store/useResumeStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { normalizeImportedTarget } from "@/store/userScope";
import {
  buildBackup,
  imagesInBackup,
  mergeById,
  ownerSlug,
  parseBackup,
  summarizeBackup,
  type BackupPayload,
} from "@/lib/backup";
import { buildBackupZip, parseBackupZip } from "@/lib/backupZip";
import { getImageBytes, importImages } from "@/lib/imageStore";
import { downloadBlob } from "@/utils/export";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PendingMode = "replace" | "merge";

/** 待确认的导入。zip 会带上图片字节，老的单个 JSON 没有 */
interface PendingImport {
  payload: BackupPayload;
  name: string;
  images: Record<string, Uint8Array>;
}

const BackupPanel = () => {
  const t = useTranslations("backup");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { profile, replaceProfile } = useCareerProfileStore();
  const currentUserId = useCareerProfileStore((s) => s.currentUserId);
  const { targets } = useJobTargetStore();
  const resumes = useResumeStore((s) => s.resumes);

  const [pending, setPending] = useState<PendingImport | null>(null);

  /**
   * 导出全库备份 —— 一个 zip：`manifest.json` + `backup.json` + `images/`。
   *
   * 图片**必须装进去**：内联进 JSON 会让文件膨胀三分之一且没法单独取用，不装则备份不完整
   * （换台机器照片就没了 —— 那正是这个功能要解决的问题）。
   */
  const handleExport = async () => {
    const now = new Date().toISOString();
    const payload = buildBackup({
      profile,
      resumes,
      targets,
      now,
      ownerName: profile?.basic.name,
    });

    // 按引用清单去找字节：缓存优先，没有就从磁盘拉
    const images: Record<string, Uint8Array> = {};
    const missing: string[] = [];
    for (const ref of imagesInBackup(payload)) {
      const bytes = await getImageBytes(ref);
      if (bytes) images[ref] = bytes;
      else missing.push(ref);
    }

    const { bytes } = buildBackupZip({ payload, images });
    const stamp = now.slice(0, 19).replace(/[:T]/g, "-");
    downloadBlob(
      new Blob([bytes], { type: "application/zip" }),
      `joblume-backup-${ownerSlug(profile?.basic.name)}-${stamp}.zip`
    );

    if (profile) {
      replaceProfile({ ...profile, meta: { ...profile.meta, lastBackupAt: now } });
    }

    toast.success(t("exportSuccess", { size: `${(bytes.byteLength / 1024).toFixed(0)} KB` }));
    // 少图要如实说 —— 一个"看起来完整"的备份比一个明说缺了什么的备份危险得多
    if (missing.length > 0) toast.warning(t("exportMissingImages", { count: missing.length }));
  };

  const handleFile = async (file: File) => {
    const buffer = new Uint8Array(await file.arrayBuffer());

    // zip 还是老的单个 JSON？先看**文件头**（PK\x03\x04）再看扩展名 ——
    // 只看扩展名的话，一个被改过名或没后缀的备份会走错分支
    const looksLikeZip =
      (buffer[0] === 0x50 && buffer[1] === 0x4b) || file.name.toLowerCase().endsWith(".zip");

    if (looksLikeZip) {
      const parsed = parseBackupZip(buffer);
      if (!parsed.ok) {
        toast.error(t("importFailed", { error: parsed.error }));
        return;
      }
      setPending({ payload: parsed.payload, name: file.name, images: parsed.images });
      return;
    }

    // 老备份（单个 JSON）继续认 —— 用户手上存的很可能就是那种
    const parsed = parseBackup(new TextDecoder().decode(buffer));
    if (!parsed.ok) {
      toast.error(t("importFailed", { error: parsed.error }));
      return;
    }
    setPending({ payload: parsed.payload, name: file.name, images: {} });
  };

  const apply = async (mode: PendingMode) => {
    if (!pending) return;
    const { payload } = pending;

    if (payload.profile) replaceProfile(payload.profile);

    const resumeResult =
      mode === "replace"
        ? { merged: Object.fromEntries(payload.resumes.map((r) => [r.id, r])), added: payload.resumes.length, skipped: 0 }
        : mergeById(resumes, payload.resumes);
    // 走 action 而不是 setState：后者不经过 set 层收口，只改别名、不进 byUser，
    // 而持久化切片只有 byUser —— 导入的简历会刷新即丢
    useResumeStore.getState().replaceResumes(resumeResult.merged);

    // 备份文件不带形状标记：v1 时代的文件里分析是按 userId 索引的，v0 的是单槽。
    // 导入前一并收敛成 v2 的单槽形状，归属取当前用户 —— 别人名下的分析顶上来
    // 只会是误导，宁可当作「还没分析过」
    const incomingTargets = currentUserId
      ? payload.targets
          .map((x) => normalizeImportedTarget(x, currentUserId))
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : [];
    const targetResult =
      mode === "replace"
        ? { merged: Object.fromEntries(incomingTargets.map((x) => [x.id, x])), added: incomingTargets.length, skipped: 0 }
        : mergeById(targets, incomingTargets);
    // 走 action：setState 不经过 set 层收口，只会改别名、不进 targetsByUser
    useJobTargetStore.getState().replaceTargets(targetResult.merged);

    // 图片：先进缓存（界面立刻能显示），再尽力上传到磁盘。
    // 放在数据之后 —— 数据里那些引用要先存在，收进来的字节才有意义
    const imageCount = await importImages(pending.images);

    toast.success(
      t("importSuccess", {
        resumes: resumeResult.added,
        targets: targetResult.added,
        skipped: resumeResult.skipped + targetResult.skipped,
      })
    );
    if (imageCount > 0) toast.success(t("importImages", { count: imageCount }));
    setPending(null);
  };

  const summary = pending ? summarizeBackup(pending.payload) : null;
  const lastBackup = profile?.meta.lastBackupAt;

  return (
    <Card className="overflow-hidden border border-border shadow-sm hover:shadow-md transition-all duration-300 bg-card/50">
      <CardHeader className="border-b border-border/50 pb-6">
        <div className="flex items-center gap-3">
          <HardDriveDownload className="h-5 w-5 text-muted-foreground" />
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold text-foreground">
              {t("title")}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground leading-relaxed">
              {t("description")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-8 px-6 pb-8 md:px-8">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {lastBackup
              ? t("lastBackup", { time: new Date(lastBackup).toLocaleString() })
              : t("neverBackedUp")}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              {t("export")}
            </Button>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {t("import")}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/zip,.zip,application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("imageNote")}</p>
        </div>
      </CardContent>

      <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("confirm.title")}</DialogTitle>
            <DialogDescription>{pending?.name}</DialogDescription>
          </DialogHeader>

          {summary && (
            <div className="space-y-1 rounded-lg border border-border/60 p-3 text-sm">
              <p>
                {t("confirm.profile")}：{summary.hasProfile ? t("confirm.hasProfile", { count: summary.entityCount }) : t("confirm.noProfile")}
              </p>
              <p>{t("confirm.resumes", { count: summary.resumeCount })}</p>
              <p>{t("confirm.targets", { count: summary.targetCount })}</p>
              {/*
                多用户下最容易出事的一步：备份文件原本不带归属，在 B 名下导入
                A 的备份会静默写进 B。这里把「备份是谁的」和「要写进谁名下」
                并排说出来，用户才有机会发现自己导错了人。
              */}
              {summary.ownerName && (
                <p className="font-medium text-foreground">
                  {t("confirm.owner", { name: summary.ownerName })}
                </p>
              )}
              <p className="font-medium text-foreground">
                {t("confirm.importInto", { name: profile?.basic.name?.trim() || t("confirm.unnamed") })}
              </p>
              {summary.exportedAt && (
                <p className="text-xs text-muted-foreground">
                  {t("confirm.exportedAt", { time: new Date(summary.exportedAt).toLocaleString() })}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t("confirm.mergeHint")}</p>
            <p className="text-destructive">{t("confirm.replaceHint")}</p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t("confirm.cancel")}
            </Button>
            <Button variant="outline" onClick={() => void apply("merge")}>
              {t("confirm.merge")}
            </Button>
            <Button variant="destructive" onClick={() => void apply("replace")}>
              {t("confirm.replace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default BackupPanel;
