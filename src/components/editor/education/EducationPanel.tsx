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

const EducationPanel = () => {
  const t = useTranslations('workbench.educationPanel');
  const { activeResume, updateEducation, updateEducationBatch } =
    useResumeStore();
  const addFromProfile = useAddSectionEntities();
  const ensureEnabled = useEnsureSectionEnabled();
  const { education = [] } = activeResume || {};
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
