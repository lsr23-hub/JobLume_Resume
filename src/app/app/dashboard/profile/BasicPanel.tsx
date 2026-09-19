import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { BasicInfo } from "@/types/resume";
import { isImageRef, resolveImageRef, storeImageFile } from "@/lib/imageStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { BirthdayPicker } from "./BirthdayPicker";
import { PhotoCropper } from "@/components/shared/PhotoCropper";
import { RegionSelector } from "./RegionSelector";

/**
 * 纯文本字段。生日与所在地有专属控件，单独处理。
 *
 * 「职位」「状态」不在此列 —— 两者不是人人都有的信息，已下沉为
 * 预设自定义字段（见 `PRESET_BASIC_FIELDS`），由用户自行开关。
 */
const TEXT_FIELDS: Array<{ key: keyof BasicInfo; labelKey: string }> = [
  { key: "name", labelKey: "basic.name" },
  { key: "email", labelKey: "basic.email" },
  { key: "phone", labelKey: "basic.phone" },
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
        {TEXT_FIELDS.map(({ key, labelKey }) => (
          <div key={String(key)} className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t(labelKey)}</Label>
            <Input
              value={(basic[key] as string) ?? ""}
              onChange={(e) => updateBasic({ [key]: e.target.value } as Partial<BasicInfo>)}
            />
          </div>
        ))}

        <BirthdayPicker
          value={basic.birthDate}
          onChange={(birthDate) => updateBasic({ birthDate })}
        />
      </div>

      <RegionSelector value={basic.location} onChange={(location) => updateBasic({ location })} />

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

/**
 * 照片：只支持本地上传，上传后强制按 3:4 裁剪。
 *
 * 不提供外链输入 —— 简历上的照片框是固定 3:4 的，外链图片比例不可控，
 * 会被 `object-fit: cover` 二次裁切，用户看到的构图与最终简历不一致。
 */
const PhotoField = () => {
  const t = useTranslations("profile");
  const { profile, updateBasic } = useCareerProfileStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const photo = profile?.basic.photo ?? "";

  useEffect(() => {
    if (!isImageRef(photo)) {
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
  }, [photo]);

  const handleConfirmCrop = async (blob: Blob) => {
    setPending(null);
    setBusy(true);
    try {
      const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
      updateBasic({ photo: await storeImageFile(file) });
      toast.success(t("photo.saved"));
    } catch (error) {
      console.error("照片保存失败:", error);
      toast.error(t("photo.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{t("basic.photo")}</Label>
      <div className="flex items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="shrink-0 rounded border border-border/60 object-cover"
            style={{ width: 72, height: 96 }}
          />
        ) : (
          <div
            className="flex shrink-0 items-center justify-center rounded border border-dashed border-border/60 text-xs text-muted-foreground"
            style={{ width: 72, height: 96 }}
          >
            {t("photo.none")}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {busy ? t("photo.processing") : preview ? t("photo.replace") : t("photo.upload")}
          </Button>
          {preview && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => updateBasic({ photo: "" })}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("photo.remove")}
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            if (!f.type.startsWith("image/")) {
              toast.error(t("photo.notImage", { name: f.name }));
            } else {
              setPending(f);
            }
          }
          e.target.value = "";
        }}
      />

      <p className="text-xs text-muted-foreground">{t("basic.photoNote")}</p>

      {pending && (
        <PhotoCropper
          file={pending}
          onCancel={() => setPending(null)}
          onConfirm={(blob) => void handleConfirmCrop(blob)}
        />
      )}
    </div>
  );
};
