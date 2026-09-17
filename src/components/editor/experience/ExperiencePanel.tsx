import { cn } from "@/lib/utils";
import { Reorder } from "framer-motion";
import { useTranslations } from "@/i18n/compat/client";
import ExperienceItem from "./ExperienceItem";
import { Experience } from "@/types/resume";
import { useResumeStore } from "@/store/useResumeStore";
import { generateUUID } from "@/utils/uuid";
import { SectionItemsPicker } from "@/components/editor/shared/SectionItemsPicker";
import { useAddSectionEntities } from "@/components/editor/shared/useAddSectionEntities";
import { useEnsureSectionEnabled } from "@/components/editor/shared/useEnsureSectionEnabled";

const ExperiencePanel = () => {
  const t = useTranslations("workbench.experiencePanel");
  const { activeResume, updateExperience, updateExperienceBatch } =
    useResumeStore();
  const addFromProfile = useAddSectionEntities();
  const ensureEnabled = useEnsureSectionEnabled();
  const { experience = [] } = activeResume || {};
  const handleCreateProject = () => {
    const newProject: Experience = {
      id: generateUUID(),
      company: t("defaultProject.company"),
      position: t("defaultProject.position"),
      date: t("defaultProject.date"),
      details: t("defaultProject.details"),
      visible: true,
    };
    updateExperience(newProject);
    ensureEnabled("experience");
  };

  return (
    <div
      className={cn(
        "space-y-4 px-4 py-4 rounded-lg",
        "bg-card border-border"
      )}
    >
      <Reorder.Group
        axis="y"
        values={experience}
        onReorder={(newOrder) => {
          updateExperienceBatch(newOrder);
        }}
        className="space-y-3"
      >
        {experience.map((item) => (
          <ExperienceItem key={item.id} experience={item}></ExperienceItem>
        ))}

        <SectionItemsPicker
          sectionId="experience"
          existingIds={experience.map((e) => e.id)}
          label={t("addButton")}
          onCreateBlank={handleCreateProject}
          onAdd={(entities) => addFromProfile("experience", entities)}
        />
      </Reorder.Group>
    </div>
  );
};

export default ExperiencePanel;
