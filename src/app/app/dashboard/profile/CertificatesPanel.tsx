import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { Certificate } from "@/types/resume";
import { deleteImage, isImageRef, resolveImageRef, storeImageFile } from "@/lib/imageStore";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateUUID } from "@/utils/uuid";

const WIDTH_OPTIONS = [100, 50, 33];

/** 把证书的 url 解析成可显示地址（idb: 引用 → blob: URL） */
const CertificateThumb = ({ cert }: { cert: Certificate }) => {
  const [src, setSrc] = useState(isImageRef(cert.url) ? "" : cert.url);

  useEffect(() => {
    if (!isImageRef(cert.url)) {
      setSrc(cert.url);
      return;
    }
    let objectUrl = "";
    void resolveImageRef(cert.url).then((url) => {
      objectUrl = url;
      setSrc(url);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cert.url]);

  if (!src) {
    return <div className="h-16 w-24 animate-pulse rounded bg-muted" />;
  }
  return <img src={src} alt="certificate" className="h-16 w-auto rounded border border-border/60 object-contain" />;
};

export const CertificatesPanel = () => {
  const t = useTranslations("profile");
  const { profile, setCertificates } = useCareerProfileStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!profile) return null;
  const certificates = profile.certificates;

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      const added: Certificate[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(t("certificates.notImage", { name: file.name }));
          continue;
        }
        const url = await storeImageFile(file);
        added.push({ id: generateUUID(), url, width: added.length === 0 && certificates.length === 0 ? 100 : 50 });
      }
      if (added.length > 0) setCertificates([...certificates, ...added]);
    } catch (error) {
      console.error("证书图片保存失败:", error);
      toast.error(t("certificates.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (cert: Certificate) => {
    setCertificates(certificates.filter((c) => c.id !== cert.id));
    // 引用被丢弃后，IndexedDB 里的二进制也一并清理，避免空间泄漏
    if (isImageRef(cert.url)) await deleteImage(cert.url);
  };

  const handleWidth = (id: string, width: number) => {
    setCertificates(certificates.map((c) => (c.id === id ? { ...c, width } : c)));
  };

  return (
    <div className="space-y-3">
      {certificates.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("certificates.empty")}</p>
        </div>
      )}

      {certificates.map((cert) => (
        <div key={cert.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <CertificateThumb cert={cert} />
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {t("certificates.widthHint")}
          </div>
          <Select value={String(cert.width)} onValueChange={(v) => handleWidth(cert.id, Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WIDTH_OPTIONS.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => void handleRemove(cert)}
            aria-label={t("delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        {busy ? t("certificates.uploading") : t("certificates.upload")}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="text-xs text-muted-foreground">{t("certificates.storageNote")}</p>
    </div>
  );
};
