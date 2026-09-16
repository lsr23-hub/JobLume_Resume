import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { BasicInfo } from "@/types/resume";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
      <div className="grid grid-cols-2 gap-4">
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

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("basic.photo")}</Label>
        <Input
          value={basic.photo}
          onChange={(e) => updateBasic({ photo: e.target.value })}
          placeholder="https://…"
        />
        <p className="text-xs text-muted-foreground">{t("basic.photoNote")}</p>
      </div>

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
