import React from "react";
import { ResumeData } from "@/types/resume";
import { withSectionOverrides } from "@/lib/sectionSettings";
import { ResumeTemplate } from "@/types/template";
import BaseInfo from "./sections/BaseInfo";
import ExperienceSection from "./sections/ExperienceSection";
import EducationSection from "./sections/EducationSection";
import ProjectSection from "./sections/ProjectSection";
import SkillSection from "./sections/SkillSection";
import SelfEvaluationSection from "./sections/SelfEvaluationSection";
import CustomSection from "./sections/CustomSection";
import SectionTitle from "./sections/SectionTitle";
import SectionWrapper from "../shared/SectionWrapper";
import CertificatesSection from "../shared/CertificatesSection";


interface ClassicTemplateProps {
    data: ResumeData;
    template: ResumeTemplate;
}

const ClassicTemplate: React.FC<ClassicTemplateProps> = ({ data, template }) => {
    const { colorScheme } = template;
    const enabledSections = data.menuSections.filter((s) => s.enabled).sort((a, b) => a.order - b.order);

    const renderSection = (sectionId: string) => {
        switch (sectionId) {
            case "basic":
                return <BaseInfo basic={data.basic} globalSettings={withSectionOverrides(data.globalSettings, "basic")} template={template} />;
            case "experience":
                return <ExperienceSection experiences={data.experience} globalSettings={withSectionOverrides(data.globalSettings, "experience")} />;
            case "education":
                return <EducationSection education={data.education} globalSettings={withSectionOverrides(data.globalSettings, "education")} />;
            case "skills":
                return <SkillSection skill={data.skillContent} globalSettings={withSectionOverrides(data.globalSettings, "skills")} />;
            case "projects":
                return <ProjectSection projects={data.projects} globalSettings={withSectionOverrides(data.globalSettings, "projects")} />;
            case "certificates":
                return (
                    <SectionWrapper sectionId="certificates" style={{ marginTop: `${data.globalSettings?.sectionSpacing || 24}px` }}>
                        <SectionTitle type="certificates" globalSettings={data.globalSettings} />
                        <CertificatesSection certificates={data.certificates} />
                    </SectionWrapper>
                );

            case "selfEvaluation":
                return <SelfEvaluationSection content={data.selfEvaluationContent} globalSettings={withSectionOverrides(data.globalSettings, "selfEvaluation")} />;
            default:
                if (sectionId in data.customData) {
                    const sectionTitle = data.menuSections.find((s) => s.id === sectionId)?.title || sectionId;
                    return <CustomSection title={sectionTitle} sectionId={sectionId} items={data.customData[sectionId]} globalSettings={data.globalSettings} />;
                }
                return null;
        }
    };

    return (
        <div className="flex flex-col w-full min-h-screen" style={{ backgroundColor: colorScheme.background, color: colorScheme.text }}>
            {enabledSections.map((section) => (
                <div key={section.id}>{renderSection(section.id)}</div>
            ))}
        </div>
    );
};

export default ClassicTemplate;
