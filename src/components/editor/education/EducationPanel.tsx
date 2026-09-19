import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/useResumeStore";
import { Reorder } from "framer-motion";
import { useTranslations } from "@/i18n/compat/client";
import EducationItem from "./EducationItem";
import { Education } from "@/types/resume";
import { generateUUID } from "@/utils/uuid";
import { SectionItemsPicker } from "@/components/editor/shared/SectionItemsPicker";
import { useAddSectionEntities } from "@/components/editor/shared/useAddSectionEntities";
import { useEnsureSectionEnabled } from "@/components/editor/shared/useEnsureSectionEnabled";
import { Switch } from "@/components/ui/switch";

const EducationPanel = () => {
  const t = useTranslations('workbench.educationPanel');
  const { activeResume, updateEducation, updateEducationBatch } =
    useResumeStore();
  const addFromProfile = useAddSectionEntities();
  const ensureEnabled = useEnsureSectionEnabled();
  const { education = [] } = activeResume || {};

  // 开关状态从数据推出来 —— 不另存一个标志，就不会出现「标志说开着、数据其实没藏」
  const briefMode = education.some((e) => e.hiddenDescription !== undefined);

  /** 开：把简介挪进影子字段并清空；关：挪回来。没有简介的条目原样不动 */
  const toggleBrief = (on: boolean): Education[] =>
    education.map((e) => {
      if (on) {
        return (e.description ?? "").trim()
          ? { ...e, hiddenDescription: e.description, description: "" }
          : e;
      }
      return e.hiddenDescription !== undefined
        ? { ...e, description: e.hiddenDescription, hiddenDescription: undefined }
        : e;
    });
  const handleCreateProject = () => {
    const newEducation: Education = {
      id: generateUUID(),
      school: t('defaultProject.school'),
      major: t('defaultProject.major'),
      degree: t('defaultProject.degree'),
      startDate: "2015-09-01",
      endDate: "2019-06-30",
      description: "",
      visible: true,
    };
    updateEducation(newEducation);
    ensureEnabled("education");
  };

  return (
    <div
      className={cn(
        "space-y-4 px-4 py-4 rounded-lg",
        "dark:bg-neutral-900/30",
      )}
    >
      {/*
        「简要模式」：只留学校 / 专业 / 学历 / 时间，隐藏学校简介。
        实现是**把 description 挪到 hiddenDescription**，而不是让模板读一个标志位 ——
        模板本就用 hasMeaningfulRichTextContent 门控简介，清空即不渲染，
        因此 4 套模板一行都不用改（守住 C2）。
        开关状态由「有没有条目藏着简介」推出来，不另存一个会与数据脱节的标志。
      */}
      {education.length > 0 && (
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("briefMode")}</span>
            <span className="block text-xs text-muted-foreground">{t("briefModeHint")}</span>
          </span>
          <Switch
            checked={briefMode}
            onCheckedChange={(on) => updateEducationBatch(toggleBrief(on))}
          />
        </label>
      )}

      <Reorder.Group
        axis="y"
        values={education}
        onReorder={(newOrder) => {
          updateEducationBatch(newOrder);
        }}
        className="space-y-3"
      >
        {(education || []).map((education) => (
          <EducationItem
            key={education.id}
            education={education}
          ></EducationItem>
        ))}

        <SectionItemsPicker
          sectionId="education"
          existingIds={education.map((e) => e.id)}
          label={t("addButton")}
          onCreateBlank={handleCreateProject}
          onAdd={(entities) => addFromProfile("education", entities)}
        />
      </Reorder.Group>
    </div>
  );
};

export default EducationPanel;
