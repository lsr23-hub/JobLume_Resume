import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Target,
  FileText,
  ChevronLeft,
  X,
  Plus,
  TriangleAlert,
  Loader2,
} from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { hasUsableProfile } from "@/lib/profile/generateResume";
import { useJobTargetStore, selectSortedTargets } from "@/store/useJobTargetStore";
import { useTemplateFit } from "./useTemplateFit";
import { FitProposal } from "./FitProposal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TemplateGallery } from "./TemplateGallery";
import { ContentSelection } from "./ContentSelection";
import { selectAllEntities } from "@/lib/profile/generateResume";

/** 生成哪一类简历。与 `ResumeSnapshot.mode` 的取值对齐（manual 是编辑器里手建的） */
export type ResumeKind = "generic" | "targeted";

export interface WizardChoice {
  mode: ResumeKind;
  /** 岗位专用简历才有 */
  targetId: string | null;
  templateId: string;
  /**
   * 最终收进简历的条目。
   *
   * 通用简历是全选（篇幅超出时是精简过的集合）；岗位专用简历是用户在
   * 「内容选择」步里勾出来的。
   */
  selection: Record<string, string[]>;
  /** 用户在内容选择步里关掉的板块。通用简历路径为空集 */
  disabledSections: Set<string>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (choice: WizardChoice) => void;
}

type Step = "mode" | "target" | "template" | "fit" | "content";

/**
 * 新建简历向导。
 *
 * 三步：类型（通用 / 岗位专用）→ 投递目标（仅岗位专用）→ 模板。
 * 生成内容的逻辑不在这里 —— 见 `@/lib/profile/generateResume`。
 */
export const CreateResumeWizard = ({ open, onOpenChange, onComplete }: Props) => {
  const t = useTranslations();
  // 板块标题在 profile 命名空间下（与 materialize 的其它调用方保持一致）
  const tSection = useTranslations("profile");
  const router = useRouter();
  const { targets } = useJobTargetStore();
  const { profile } = useCareerProfileStore();
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<ResumeKind>("generic");
  const [targetId, setTargetId] = useState<string | null>(null);

  // 岗位专用路径的状态。通用路径不用它们
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);

  const { measuring, pending, pickTemplate, reset, measurePlan, measureHost } = useTemplateFit({
    mode,
    targetId,
    onFits: (tpl, selection) =>
      onComplete({ mode, targetId, templateId: tpl, selection, disabledSections: new Set() }),
  });

  const sortedTargets = useMemo(() => selectSortedTargets(targets), [targets]);

  // 每次重新打开都从头开始 —— 否则会停在上次的残留状态
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setStep("mode");
      setMode("generic");
      setTargetId(null);
      setTemplateId(null);
      setChecked(new Set());
      setDisabledSections(new Set());
      setPages(null);
      reset();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, reset]);

  const pickMode = (next: ResumeKind) => {
    setMode(next);
    // 换类型时丢掉上一次挑的目标，否则「通用」会带着一个用不上的 targetId
    if (next === "generic") setTargetId(null);
    setStep(next === "targeted" ? "target" : "template");
  };

  const pickTarget = (id: string) => {
    setTargetId(id);
    // 选择是跟着目标走的，换目标就把上一次的勾选丢掉
    setChecked(new Set());
    setDisabledSections(new Set());
    setPages(null);
    setStep("template");
  };

  const allVisibleIds = () => {
    const ids = new Set<string>();
    for (const e of Object.values(profile?.entities ?? {})) {
      if (!e.hidden) ids.add(e.id);
    }
    return ids;
  };

  /**
   * 岗位专用路径选完模板：**不测算、不弹提议**，直接进内容选择。
   *
   * 默认勾选分两种情况：
   * - **有分析结果** → 一条都不勾。D19 的规则：AI 一预设勾选，用户会直接点
   *   确认而不逐条审视。这里正是有推荐可审的时候
   * - **没有分析结果**（未配 Key / 分析失败 / 没分析过）→ 全选。没有任何推荐
   *   可审，让用户从零勾一遍纯属折磨，而且这正是改动前一直以来的行为
   */
  const pickTargetedTemplate = async (tpl: string) => {
    setTemplateId(tpl);
    const analysis = targetId ? targets[targetId]?.matchAnalysis ?? null : null;
    const initial = analysis ? new Set<string>() : allVisibleIds();
    setChecked(initial);
    setStep("content");

    // 进页面后量一次篇幅，作为提示。用户改勾选后这个数会标为待重算
    setPlanning(true);
    const selection = groupBySection(initial);
    const plan = await measurePlan(selection, tpl);
    setPages(plan?.pagesBefore ?? null);
    setPlanning(false);
  };

  const groupBySection = (ids: Set<string>): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const id of Array.from(ids)) {
      const entity = profile?.entities[id];
      if (!entity) continue;
      (out[entity.sectionId] ??= []).push(id);
    }
    return out;
  };

  const toggleEntity = (entityId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
    setPages(null); // 选择变了，之前量出来的页数不再作数
  };

  const toggleSection = (sectionId: string, enabled: boolean) => {
    setDisabledSections((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  /**
   * 当前展示哪一步。
   *
   * 「篇幅提议」这一步**由 `pending` 派生**，而不是另外存一个 step ——
   * 存放两份状态就会有对不上的时候（提炼 hook 时就踩过：`setStep("fit")`
   * 留在向导里，而 setPending 搬进了 hook，结果提议算出来了却不显示）。
   */
  const currentStep: Step = pending ? "fit" : step;

  const goBack = () => {
    if (currentStep === "fit") {
      reset();
      setStep("template");
    } else if (currentStep === "content") {
      // 回退不清勾选 —— 用户可能只是回去换个模板再看看
      setStep("template");
    } else if (currentStep === "template" && mode === "targeted") setStep("target");
    else setStep("mode");
  };

  const title = t("dashboard.resumes.createDialog.title");
  // 数据库是空的就没必要往下走 —— 生成出来会是一份只有姓名的空壳，
  // 用户走完三步才发现，不如在第一步就说清楚
  const profileReady = hasUsableProfile(profile);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-w-[1100px] w-[95vw] h-[90vh] sm:h-[85vh] p-0 overflow-hidden bg-card/95 dark:bg-gray-950/95 backdrop-blur-2xl border-white/20 dark:border-white/10 shadow-2xl rounded-[2rem] flex flex-col"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="relative w-full h-full min-h-0 flex flex-col">
          <div className="flex-none px-8 py-6 flex items-center gap-4 z-10">
            {currentStep !== "mode" && (
              <button
                type="button"
                onClick={goBack}
                aria-label={t("dashboard.resumes.createDialog.back")}
                className="p-2 -ml-2 rounded-full hover:bg-accent transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-muted-foreground" />
              </button>
            )}

            <div className="flex-1 text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-gray-500 dark:from-white dark:to-gray-400">
              {currentStep === "mode" && t("dashboard.resumes.createDialog.modeTitle")}
              {currentStep === "target" && t("dashboard.resumes.createDialog.selectTargetTitle")}
              {currentStep === "template" && t("dashboard.resumes.createDialog.selectTemplateTitle")}
              {currentStep === "fit" && t("dashboard.resumes.createDialog.fitTitle")}
              {currentStep === "content" &&
                t("dashboard.resumes.createDialog.contentTitle")}
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("common.cancel")}
              className="p-2 -mr-2 rounded-full hover:bg-accent transition-colors"
            >
              <X className="w-6 h-6 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 min-h-0 relative w-full">
            <ScrollArea className="h-full w-full">
              <div className="px-8 pb-12 max-w-7xl mx-auto">
                {currentStep === "mode" && !profileReady && (
                  <div className="max-w-3xl mx-auto pt-4">
                    <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.resumes.needProfile")}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          router.push("/app/dashboard/profile");
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("dashboard.resumes.goFillProfile")}
                      </Button>
                    </div>
                  </div>
                )}

                {currentStep === "mode" && profileReady && (
                  <div className="grid gap-6 sm:grid-cols-2 max-w-3xl mx-auto pt-4">
                    <ModeCard
                      icon={<FileText className="w-10 h-10" />}
                      title={t("dashboard.resumes.createDialog.genericTitle")}
                      description={t("dashboard.resumes.createDialog.genericDesc")}
                      onClick={() => pickMode("generic")}
                    />
                    <ModeCard
                      icon={<Target className="w-10 h-10" />}
                      title={t("dashboard.resumes.createDialog.targetedTitle")}
                      description={t("dashboard.resumes.createDialog.targetedDesc")}
                      onClick={() => pickMode("targeted")}
                    />
                  </div>
                )}

                {currentStep === "target" && (
                  <div className="max-w-3xl mx-auto pt-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("dashboard.resumes.createDialog.selectTargetDesc")}
                    </p>

                    {sortedTargets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {t("dashboard.resumes.createDialog.noTargets")}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            onOpenChange(false);
                            router.push("/app/dashboard/targets");
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t("dashboard.resumes.createDialog.goCreateTarget")}
                        </Button>
                      </div>
                    ) : (
                      sortedTargets.map((target) => (
                        <motion.button
                          key={target.id}
                          type="button"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => pickTarget(target.id)}
                          className={cn(
                            "w-full text-left rounded-2xl border border-border/60 dark:border-gray-800/60",
                            "bg-muted/50 dark:bg-gray-900/50 p-5 transition-all",
                            "hover:bg-card hover:shadow-lg hover:border-primary/50"
                          )}
                        >
                          <div className="font-semibold text-foreground">
                            {target.company}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {target.position}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                            {target.jdRaw.replace(/\s+/g, " ").slice(0, 60)}
                          </p>
                        </motion.button>
                      ))
                    )}
                  </div>
                )}

                {currentStep === "template" && (
                  <TemplateGallery
                    onPick={mode === "targeted" ? pickTargetedTemplate : pickTemplate}
                  />
                )}

                {currentStep === "content" && templateId && (
                  <ContentSelection
                    analysis={targetId ? targets[targetId]?.matchAnalysis ?? null : null}
                    entities={Object.values(profile?.entities ?? {}).filter((e) => !e.hidden)}
                    checked={checked}
                    onToggle={toggleEntity}
                    onToggleSection={toggleSection}
                    disabledSections={disabledSections}
                    pages={pages}
                  />
                )}

                {currentStep === "fit" && pending && (
                  <FitProposal
                    plan={pending.plan}
                    hintKey={pending.hintKey}
                    onApply={() =>
                      onComplete({
                        mode,
                        targetId,
                        templateId: pending.templateId,
                        selection: pending.plan.kept,
                        disabledSections: new Set(),
                      })
                    }
                    onKeepAll={() =>
                      onComplete({
                        mode,
                        targetId,
                        templateId: pending.templateId,
                        selection: pending.selection,
                        disabledSections: new Set(),
                      })
                    }
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          {currentStep === "content" && (
            <div className="flex-none border-t border-border/40 px-8 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  {planning
                    ? t("dashboard.resumes.createDialog.fitMeasuring")
                    : t("dashboard.resumes.createDialog.selectedCount", { count: checked.size })}
                </span>
                <Button
                  disabled={checked.size === 0 || planning}
                  onClick={() =>
                    onComplete({
                      mode,
                      targetId,
                      templateId: templateId!,
                      selection: groupBySection(checked),
                      disabledSections,
                    })
                  }
                >
                  {t("dashboard.resumes.createDialog.startGenerate")}
                </Button>
              </div>
            </div>
          )}

          {measureHost}

          {measuring && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/70 dark:bg-gray-950/70 backdrop-blur-sm">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.resumes.createDialog.fitMeasuring")}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ModeCard = ({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <motion.button
    type="button"
    whileHover={{ y: -4, scale: 1.01 }}
    whileTap={{ scale: 0.99 }}
    onClick={onClick}
    className={cn(
      "group text-left rounded-2xl border border-border/60 dark:border-gray-800/60",
      "bg-muted/50 dark:bg-gray-900/50 p-8 transition-all",
      "hover:bg-card hover:shadow-xl hover:border-primary/50"
    )}
  >
    <div className="w-16 h-16 rounded-2xl bg-card dark:bg-gray-800 shadow-inner flex items-center justify-center border border-border dark:border-gray-700 text-muted-foreground group-hover:text-primary transition-colors">
      {icon}
    </div>
    <h5 className="mt-5 text-xl font-bold text-foreground group-hover:text-primary transition-colors">
      {title}
    </h5>
    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
      {description}
    </p>
  </motion.button>
);
