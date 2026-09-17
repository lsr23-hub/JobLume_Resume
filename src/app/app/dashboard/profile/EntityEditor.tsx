import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { ProfileEntity } from "@/types/profile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/shared/rich-editor/RichEditor";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";
import { UnifiedDateRangeInput } from "@/components/ui/unified-date-range-input";
import { cn } from "@/lib/utils";
import { TagsInput } from "./TagsInput";

type FieldType = "text" | "editor" | "date" | "date-range";

interface FieldDef {
  key: keyof ProfileEntity;
  labelKey: string;
  type: FieldType;
}

/** 各板块的内容字段。未列出的板块用 default */
const SECTION_FIELDS: Record<string, FieldDef[]> = {
  education: [
    { key: "title", labelKey: "field.school", type: "text" },
    { key: "subtitle", labelKey: "field.major", type: "text" },
    { key: "degree", labelKey: "field.degree", type: "text" },
    { key: "dateRange", labelKey: "field.dateRange", type: "date-range" },
    { key: "gpa", labelKey: "field.gpa", type: "text" },
  ],
  experience: [
    { key: "title", labelKey: "field.company", type: "text" },
    { key: "subtitle", labelKey: "field.position", type: "text" },
    { key: "dateRange", labelKey: "field.dateRange", type: "date-range" },
  ],
  projects: [
    { key: "title", labelKey: "field.projectName", type: "text" },
    { key: "subtitle", labelKey: "field.role", type: "text" },
    { key: "dateRange", labelKey: "field.dateRange", type: "date-range" },
    { key: "link", labelKey: "field.link", type: "text" },
    { key: "linkLabel", labelKey: "field.linkLabel", type: "text" },
  ],
  languages: [
    { key: "title", labelKey: "field.language", type: "text" },
    { key: "subtitle", labelKey: "field.level", type: "text" },
  ],
  // 荣誉只到月份单点，没有区间
  honors: [
    { key: "title", labelKey: "field.title", type: "text" },
    { key: "subtitle", labelKey: "field.subtitle", type: "text" },
    { key: "dateRange", labelKey: "field.dateRange", type: "date" },
  ],
};

const DEFAULT_FIELDS: FieldDef[] = [
  { key: "title", labelKey: "field.title", type: "text" },
  { key: "subtitle", labelKey: "field.subtitle", type: "text" },
  { key: "dateRange", labelKey: "field.dateRange", type: "text" },
];

export const EntityEditor = ({ entity }: { entity: ProfileEntity }) => {
  const t = useTranslations("profile");
  const { updateEntity } = useCareerProfileStore();

  const fields = SECTION_FIELDS[entity.sectionId] ?? DEFAULT_FIELDS;

  const patch = (key: keyof ProfileEntity, value: string) => {
    updateEntity(entity.id, { [key]: value } as Partial<ProfileEntity>);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div
            key={String(field.key)}
            // 选择器比文本框宽，占满整行才放得下两个月份
            className={cn("space-y-1.5", field.type !== "text" && "sm:col-span-2")}
          >
            <Label className="text-xs text-muted-foreground">{t(field.labelKey)}</Label>
            {field.type === "date-range" ? (
              <UnifiedDateRangeInput
                value={(entity[field.key] as string) ?? ""}
                onChange={(value) => patch(field.key, value)}
                showPresentSwitch
              />
            ) : field.type === "date" ? (
              <UnifiedDateInput
                value={(entity[field.key] as string) ?? ""}
                onChange={(value) => patch(field.key, value)}
              />
            ) : (
              <Input
                value={(entity[field.key] as string) ?? ""}
                onChange={(e) => patch(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("field.description")}</Label>
        <RichTextEditor
          content={entity.description}
          onChange={(html) => updateEntity(entity.id, { description: html })}
          placeholder={t("field.descriptionPlaceholder")}
        />
      </div>

      <details className="rounded-lg border border-border/50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          {t("hints.title")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">{t("hints.why")}</p>

        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("hints.category")}</Label>
            <TagsInput
              value={entity.tags}
              onChange={(tags) => updateEntity(entity.id, { tags })}
              placeholder={t("hints.categoryPlaceholder")}
              firstIsCategory
            />
            <p className="text-xs text-muted-foreground">{t("hints.categoryNote")}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("hints.skills")}</Label>
            <TagsInput
              value={entity.skills}
              onChange={(skills) => updateEntity(entity.id, { skills })}
              placeholder={t("hints.tagPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("hints.metrics")}</Label>
            <TagsInput
              value={entity.metrics}
              onChange={(metrics) => updateEntity(entity.id, { metrics })}
              placeholder={t("hints.metricPlaceholder")}
            />
          </div>
        </div>
      </details>
    </div>
  );
};
