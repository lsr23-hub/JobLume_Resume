import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { BasicInfo } from "@/types/resume";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { isImageRef, resolveImageRef, storeImageFile } from "@/lib/imageStore";

const BASIC_FIELDS: Array<{ key: keyof BasicInfo; labelKey: string }> = [
  { key: "name", labelKey: "basic.name" },
  { key: "title", labelKey: "basic.jobTitle" },
  { key: "employementStatus", labelKey: "basic.status" },
  { key: "birthDate", labelKey: "basic.birthDate" },
  { key: "email", labelKey: "basic.email" },
  { key: "phone", labelKey: "basic.phone" },
  { key: "location", labelKey: "basic.location" },
];

export const BasicPanel = () => {
  const t = useTranslations("profile");
  const { profile, updateBasic } = useCareerProfileStore();

  if (!profile) return null;
  const { basic } = profile;

  const updateCustomField = (id: string, patch: { value?: string; visible?: boolean }) => {
    updateBasic({
      customFields: basic.customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BASIC_FIELDS.map(({ key, labelKey }) => (
          <div key={String(key)} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t(labelKey)}</Label>
            <Input
              value={(basic[key] as string) ?? ""}
              onChange={(e) => updateBasic({ [key]: e.target.value } as Partial<BasicInfo>)}
            />
          </div>
        ))}
      </div>

      <PhotoField />

      <div className="space-y-3">
        <div>
          <Label className="text-sm font-medium">{t("basic.customFields")}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("basic.customFieldsNote")}</p>
        </div>

        {basic.customFields.map((field) => (
          <div key={field.id} className="flex items-center gap-3">
            <Switch
              checked={field.visible !== false}
              onCheckedChange={(visible) => updateCustomField(field.id, { visible })}
              aria-label={`${field.label} ${t("basic.toggleVisible")}`}
            />
            <span className="w-24 shrink-0 text-sm text-muted-foreground">
              {t(`basic.custom.${field.id}`)}
            </span>
            <Input
              value={field.value}
              onChange={(e) => updateCustomField(field.id, { value: e.target.value })}
              disabled={field.visible === false}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

/** 照片：支持本地上传（存 IndexedDB）或填写外链 */
const PhotoField = () => {
  const t = useTranslations("profile");
  const { profile, updateBasic } = useCareerProfileStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);

  const photo = profile?.basic.photo ?? "";
  const isRef = isImageRef(photo);

  useEffect(() => {
    if (!isRef) {
      setPreview(photo);
      return;
    }
    let objectUrl = "";
    void resolveImageRef(photo).then((url) => {
      objectUrl = url;
      setPreview(url);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, isRef]);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("certificates.notImage", { name: file.name }));
      return;
    }
    setBusy(true);
    try {
      updateBasic({ photo: await storeImageFile(file) });
    } catch (error) {
      console.error("照片保存失败:", error);
      toast.error(t("certificates.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.photo")}</Label>
      <div className="flex items-center gap-3">
        {preview && (
          <img
            src={preview}
            alt=""
            className="h-16 w-12 shrink-0 rounded border border-border/60 object-cover"
          />
        )}
        <Input
          value={isRef ? "" : photo}
          onChange={(e) => updateBasic({ photo: e.target.value })}
          placeholder={isRef ? t("basic.photoStored") : "https://…"}
          disabled={isRef}
        />
        <Button variant="outline" className="shrink-0" disabled={busy} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" />
          {busy ? t("certificates.uploading") : t("basic.uploadPhoto")}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">{t("basic.photoNote")}</p>
    </div>
  );
};
