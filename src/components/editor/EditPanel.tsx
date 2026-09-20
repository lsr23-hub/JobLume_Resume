import { Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useResumeStore } from "@/store/useResumeStore";
import { cn } from "@/lib/utils";
import BasicPanel from "./basic/BasicPanel";
import EducationPanel from "./education/EducationPanel";
import ProjectPanel from "./project/ProjectPanel";
import ExperiencePanel from "./experience/ExperiencePanel";
import CustomPanel from "./custom/CustomPanel";
import SkillPanel from "./skills/SkillPanel";
import SelfEvaluationPanel from "./self-evaluation/SelfEvaluationPanel";
import CertificatesPanel from "./certificates/CertificatesPanel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

export function EditPanel() {
  const { activeResume, updateMenuSections } = useResumeStore();
  if (!activeResume) return;
  const { activeSection = "", menuSections = [] } = activeResume || {};

  const renderFields = () => {
    switch (activeSection) {
      case "basic":
        return <BasicPanel />;

      case "projects":
        return <ProjectPanel />;
      case "education":
        return <EducationPanel />;
      case "experience":
        return <ExperiencePanel />;
      case "skills":
        return <SkillPanel />;
      case "selfEvaluation":
        return <SelfEvaluationPanel />;
      case "certificates":
        return <CertificatesPanel />;
      default:
        // 其余一律按「自定义板块」编辑 —— 与模板层的规则对齐。
        //
        // 模板是 `if (sectionId in data.customData) return <CustomSection/>`，
        // 生成简历时 campus / honors / languages 走的就是这条通道。
        // 上游这里原本只认 id 以 "custom" 开头的（SidePanel 添加模块时的命名），
        // 于是这几个板块会掉进 BasicPanel —— 不但编辑界面不对，
        // 在那边改内容还会写进 basic，把基本信息改坏。
        //
        // 这里比模板再放宽一点：非内置 id 全部交给 CustomPanel，
        // 好让「还没有条目」的自定义板块也能打开去添加。
        return activeSection ? (
          <CustomPanel sectionId={activeSection} />
        ) : (
          <BasicPanel />
        );
    }
  };

  return (
    <motion.div
      className={cn(
        "w-full h-full border-r overflow-y-auto",
        "bg-background border-border"
      )}
    >
      <div className="p-4">
        <motion.div
          className={cn(
            "mb-4 p-4 rounded-lg border",
            "bg-card border-border"
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {menuSections?.find((s) => s.id === activeSection)?.icon}
            </span>

            {/* 如果是基本信息的展示话展示div */}
            {activeSection === "basic" ? (
              <div>
                <span className="text-lg font-semibold text-primary">
                  {menuSections?.find((s) => s.id === activeSection)?.title}
                </span>
              </div>
            ) : (
              <>
                <input
                  className={cn(
                    "flex-1 text-lg  font-medium  text-primary border-black  bg-transparent outline-none   pb-1 text-primary"
                  )}
                  type="text"
                  value={
                    menuSections?.find((s) => s.id === activeSection)?.title
                  }
                  onChange={(e) => {
                    const newMenuSections = menuSections.map((s) => {
                      if (s.id === activeSection) {
                        return {
                          ...s,
                          title: e.target.value,
                        };
                      }
                      return s;
                    });
                    updateMenuSections(newMenuSections);
                  }}
                />
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Pencil size={16} className="text-primary" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>点击文字部分即可聚焦编辑</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        </motion.div>

        <motion.div
          className={cn(
            "rounded-lg",
            "bg-card border-border"
          )}
        >
          {renderFields()}
        </motion.div>
      </div>
    </motion.div>
  );
}
