import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/useResumeStore";
import { Reorder } from "framer-motion";
import { useTranslations } from "@/i18n/compat/client";
import ProjectItem from "./ProjectItem";
import { Project } from "@/types/resume";
import { generateUUID } from "@/utils/uuid";
import { SectionItemsPicker } from "@/components/editor/shared/SectionItemsPicker";
import { useAddSectionEntities } from "@/components/editor/shared/useAddSectionEntities";
import { useEnsureSectionEnabled } from "@/components/editor/shared/useEnsureSectionEnabled";

const ProjectPanel = () => {
  const t = useTranslations("workbench.projectPanel");
  const { activeResume, updateProjects, updateProjectsBatch } =
    useResumeStore();
  const addFromProfile = useAddSectionEntities();
  const ensureEnabled = useEnsureSectionEnabled();
  const { projects = [] } = activeResume || {};
  const handleCreateProject = () => {
    const newProject: Project = {
      id: generateUUID(),
      name: t("defaultProject.name"),
      role: t("defaultProject.role"),
      date: t("defaultProject.date"),
      description: t("defaultProject.description"),
      visible: true,
    };
    updateProjects(newProject);
    ensureEnabled("projects");
  };

  return (
    <div
      className={cn(
        "space-y-4 px-4 py-4 rounded-lg",
        "bg-card border-border",
      )}
    >
      <Reorder.Group
        axis="y"
        values={projects}
        onReorder={(newOrder) => {
          updateProjectsBatch(newOrder);
        }}
        className="space-y-3"
      >
        {projects.map((project) => (
          <ProjectItem key={project.id} project={project}></ProjectItem>
        ))}

        <SectionItemsPicker
          sectionId="projects"
          existingIds={projects.map((p) => p.id)}
          label={t("addButton")}
          onCreateBlank={handleCreateProject}
          onAdd={(entities) => addFromProfile("projects", entities)}
        />
      </Reorder.Group>
    </div>
  );
};

export default ProjectPanel;
