import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "@/i18n/compat/client";
import { Button } from "@/components/ui/button";
import { DEFAULT_TEMPLATES } from "@/config";
import { initialResumeState } from "@/config/initialResumeData";
import ResumeTemplateComponent from "@/components/templates";
import { useTemplateSnapshots } from "@/hooks/useTemplateSnapshots";
import type { Translator } from "@/i18n/compat/utils";
import type { ResumeData } from "@/types/resume";
import type { ResumeTemplate } from "@/types/template";
import { ChevronLeft, Sparkles } from "lucide-react";
import { normalizeFontFamily } from "@/utils/fonts";

/** A4 = 210mm × 297mm，按 96dpi 折算 */
export const A4_WIDTH_PX = 793.700787;
export const A4_HEIGHT_PX = 1122.519685;

export type TemplateOption = ResumeTemplate & { nameKey: string };

const toTemplateNameKey = (templateId: string) =>
    templateId === "left-right" ? "leftRight" : templateId;

const TEMPLATE_OPTIONS: TemplateOption[] = DEFAULT_TEMPLATES.map((template) => ({
    ...template,
    nameKey: toTemplateNameKey(template.id),
}));

const TemplateCardThumbnail = ({
    template,
    t,
    snapshotSrc,
}: {
    template: TemplateOption;
    t: Translator;
    snapshotSrc?: string | null;
}) => {
    if (snapshotSrc) {
        return (
            <img
                src={snapshotSrc}
                alt={t(`dashboard.templates.${template.nameKey}.name`)}
                className="h-full w-full object-cover object-top"
                loading="eager"
                draggable={false}
            />
        );
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted dark:bg-gray-800/50">
            <span className="text-lg font-semibold text-foreground">
                {t(`dashboard.templates.${template.nameKey}.name`)}
            </span>
        </div>
    );
};

/**
 * 真实渲染一份示例简历并等比缩放到容器宽度。
 *
 * 比截图缩略图更准 —— 模板改了什么立刻能看出来。`quality="high"` 时
 * 额外塞一条示例经历，避免大预览里出现一块空白。
 */
const TemplatePreview = ({
    template,
    t,
    scaleModifier = 1,
    quality = "low",
}: {
    template: TemplateOption;
    t: Translator;
    scaleModifier?: number;
    quality?: "low" | "high";
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.2);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const { width } = entries[0].contentRect;
            if (width > 0) setScale((width / A4_WIDTH_PX) * scaleModifier);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [scaleModifier]);

    const sampleExperience =
        quality === "high"
            ? [
                  {
                      id: "1",
                      company: t("dashboard.resumes.createDialog.sample.company"),
                      position: t("dashboard.resumes.createDialog.sample.position"),
                      date: `2020-01 - ${t("dashboard.resumes.createDialog.sample.present")}`,
                      details: t("dashboard.resumes.createDialog.sample.workDescription"),
                      visible: true,
                  },
              ]
            : [];

    const previewData: ResumeData = {
        ...initialResumeState,
        id: "preview-mock",
        templateId: template.id,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        globalSettings: {
            ...initialResumeState.globalSettings,
            themeColor: template.colorScheme?.primary || "#000",
            sectionSpacing: template.spacing?.sectionGap || 16,
            paragraphSpacing: template.spacing?.itemGap || 8,
            pagePadding: template.spacing?.contentPadding || 32,
        },
        basic: {
            ...initialResumeState.basic,
            layout: (template.basic?.layout as never) || "left",
        },
        experience: sampleExperience,
    };

    return (
        <div className="w-full h-full overflow-hidden bg-card flex items-center justify-center" ref={containerRef}>
            <div
                style={{ width: scale * A4_WIDTH_PX, height: scale * A4_HEIGHT_PX }}
                className="flex-shrink-0"
            >
                <div
                    className="bg-card origin-top-left pointer-events-none"
                    style={{
                        width: "210mm",
                        height: "297mm",
                        transform: `scale(${scale})`,
                        padding: `${template.spacing?.contentPadding || 32}px`,
                        fontFamily: normalizeFontFamily(previewData.globalSettings?.fontFamily),
                    }}
                >
                    <ResumeTemplateComponent data={previewData} template={template} />
                </div>
            </div>
        </div>
    );
};

interface Props {
    onPick: (templateId: string) => void;
}

/**
 * 模板选择步骤。
 *
 * 从原来的 `CreateResumeModal` 整段搬来，去掉「从空白开始」那一套
 * （`BLANK_TEMPLATE` 与所有 `isBlank` 分支）。
 */
export const TemplateGallery = ({ onPick }: Props) => {
    const t = useTranslations();
    const locale = useLocale();
    const { snapshotMap } = useTemplateSnapshots(locale);
    const [previewTarget, setPreviewTarget] = useState<TemplateOption | null>(null);
    // 生成要写 store + 跳路由，连点两次会产出两份简历
    const [picked, setPicked] = useState(false);

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 sm:gap-8">
                {TEMPLATE_OPTIONS.map((template) => {
                    const templateName = t(`dashboard.templates.${template.nameKey}.name`);

                    return (
                        <motion.div
                            key={template.id}
                            layoutId={`card-container-${template.id}`}
                            whileHover={{ y: 0, scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setPreviewTarget(template)}
                            className="group cursor-pointer flex flex-col"
                        >
                            <motion.div
                                layoutId={`card-image-${template.id}`}
                                className="aspect-[210/297] rounded-2xl overflow-hidden border border-border/60 dark:border-gray-800/60 shadow-sm transition-all duration-300 group-hover:shadow-xl group-hover:border-primary/50 dark:group-hover:border-primary/50 bg-card relative"
                            >
                                <TemplateCardThumbnail
                                    template={template}
                                    t={t}
                                    snapshotSrc={snapshotMap[template.id]}
                                />
                                <div className="absolute inset-0 ring-1 ring-inset ring-black/5 dark:ring-white/5 rounded-2xl pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-t from-foreground/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </motion.div>

                            <motion.div
                                layoutId={`card-title-${template.id}`}
                                className="mt-4 flex items-center justify-center"
                            >
                                <span className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors">
                                    {templateName}
                                </span>
                            </motion.div>
                        </motion.div>
                    );
                })}
            </div>

            {/* 大预览：共享布局动画从卡片放大到全屏 */}
            <AnimatePresence>
                {previewTarget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="fixed inset-0 z-50 bg-card flex flex-col sm:flex-row overflow-hidden rounded-[2rem]"
                    >
                        <div className="flex-1 relative bg-muted/50 flex flex-col items-center justify-center p-8 sm:p-12 h-full overflow-hidden">
                            <div className="p-6 flex justify-start w-full absolute top-0 left-0 z-20">
                                <button
                                    type="button"
                                    onClick={() => setPreviewTarget(null)}
                                    className="rounded-full p-2 hover:bg-card/80 dark:hover:bg-gray-800/80 transition-colors"
                                    aria-label={t("dashboard.resumes.createDialog.backToGrid")}
                                >
                                    <ChevronLeft className="w-5 h-5 text-muted-foreground hover:text-primary dark:text-muted-foreground" />
                                </button>
                            </div>

                            <motion.div
                                layoutId={`card-container-${previewTarget.id}`}
                                className="w-full flex-1 flex flex-col items-center justify-center p-2 min-h-0"
                            >
                                <motion.div
                                    layoutId={`card-image-${previewTarget.id}`}
                                    className="aspect-[210/297] rounded-xl overflow-hidden shadow-2xl shadow-black/10 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/10 bg-card"
                                    style={{ maxHeight: "100%", maxWidth: "100%", height: "100%", width: "auto" }}
                                >
                                    <TemplatePreview template={previewTarget} t={t} quality="high" />
                                </motion.div>
                            </motion.div>
                        </div>

                        <div className="w-full sm:w-[400px] bg-card border-l border-border flex flex-col h-full shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)] relative z-10">
                            <div className="flex-1 p-10 flex flex-col justify-center">
                                <motion.div
                                    layoutId={`card-title-${previewTarget.id}`}
                                    className="inline-block"
                                >
                                    <h3 className="text-4xl font-black tracking-tight text-foreground mb-4">
                                        {t(`dashboard.templates.${previewTarget.nameKey}.name`)}
                                    </h3>
                                </motion.div>

                                <div className="w-12 h-1.5 bg-primary rounded-full mb-6" />

                                <p className="text-muted-foreground text-lg leading-relaxed mb-10 font-medium">
                                    {t(`dashboard.templates.${previewTarget.nameKey}.description`)}
                                </p>

                                <Button
                                    size="lg"
                                    disabled={picked}
                                    className="w-full h-14 text-lg font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    onClick={() => {
                                      setPicked(true);
                                      onPick(previewTarget.id);
                                    }}
                                >
                                    {t("dashboard.resumes.createDialog.useThisTemplate")}
                                    <Sparkles className="w-5 h-5 ml-2 opacity-70" />
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
