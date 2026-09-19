import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { Plus, Settings, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getConfig, getFileHandle } from "@/utils/fileSystem";
import { preloadFontFamily } from "@/utils/fonts";
import { useResumeStore } from "@/store/useResumeStore";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useJobTargetStore } from "@/store/useJobTargetStore";
import { generateResume } from "@/lib/profile/generateResume";
import { profileImportFromAiResult } from "@/lib/profile/importFromAi";
import { generateUUID } from "@/utils/uuid";
import { CreateResumeWizard, type WizardChoice } from "./CreateResumeWizard";
import { ImportResumeDialog } from "./ImportResumeDialog";
import { ResumeCardItem } from "./ResumeCardItem";
import { AnimatedImportButton } from "./AnimatedImportButton";
import {
    extractJsonContent,
    toStringArray
} from "./utils";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

const MAX_PDF_IMPORT_PAGES = 3;
const PDF_IMAGE_QUALITY = 0.82;
const PDF_MAX_IMAGE_WIDTH = 1600;

export const ResumeWorkbench = () => {
    const t = useTranslations();
    // 板块名与证书标签都挂在 profile 命名空间下（见 SECTION_DEFS.titleKey）
    const tSection = useTranslations("profile");
    const locale = useLocale();
    const {
        resumes,
        setActiveResume,
        addResume,
        deleteResume,
    } = useResumeStore();
    const { profile, addEntity, addSkillGroup, updateBasic } = useCareerProfileStore();
    const { targets } = useJobTargetStore();
    const { deepseekApiKey, deepseekModelId } = useAIConfigStore();
    const router = useRouter();
    const [hasConfiguredFolder, setHasConfiguredFolder] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const jsonFileInputRef = useRef<HTMLInputElement>(null);
    const pdfFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadSavedConfig = async () => {
            try {
                const handle = await getFileHandle("syncDirectory");
                const path = await getConfig("syncDirectoryPath");
                if (handle && path) {
                    setHasConfiguredFolder(true);
                }
            } catch (error) {
                console.error("Error loading saved config:", error);
            }
        };

        loadSavedConfig();
    }, []);

    useEffect(() => {
        const fontFamilies = Array.from(
            new Set(
                Object.values(resumes)
                    .map((resume) => resume.globalSettings?.fontFamily)
                    .filter(Boolean)
            )
        );

        if (fontFamilies.length === 0) return;

        let cancelled = false;
        const warmFonts = () => {
            if (cancelled) return;
            fontFamilies.forEach((fontFamily) => {
                preloadFontFamily(fontFamily).catch((error) => {
                    console.warn("Failed to preload resume font:", error);
                });
            });
        };

        const supportsIdleCallback =
            typeof window !== "undefined" &&
            typeof window.requestIdleCallback === "function";
        const idleCallback = supportsIdleCallback
            ? window.requestIdleCallback(warmFonts, { timeout: 2500 })
            : globalThis.setTimeout(warmFonts, 1000);

        return () => {
            cancelled = true;
            if (
                supportsIdleCallback &&
                typeof window !== "undefined" &&
                typeof window.cancelIdleCallback === "function"
            ) {
                window.cancelIdleCallback(idleCallback as number);
            } else {
                globalThis.clearTimeout(idleCallback);
            }
        };
    }, [resumes]);

    /**
     * 向导选完类型 / 投递目标 / 模板后，直接从职业数据库生成一份简历。
     *
     * 不再走「先用示例数据建一份空简历、再二次改写」的老路 ——
     * `generateResume` 一次产出完整内容，模板排版参数也一并带上。
     */
    const handleWizardComplete = (choice: WizardChoice) => {
        if (!profile) {
            toast.error(t("dashboard.resumes.needProfile"));
            return;
        }

        const now = new Date().toISOString();
        const id = generateUUID();
        const target = choice.targetId ? targets[choice.targetId] ?? null : null;

        const baseTitle =
            choice.mode === "targeted" && target
                ? `${target.company} · ${target.position}`
                : t("dashboard.resumes.generatedGenericTitle");

        // 同步目录里文件名就是标题（`syncResumeToFile`）。同名会直接覆盖上一份，
        // 所以只在真的撞名时才加后缀，平时保持标题干净
        const taken = new Set(Object.values(resumes).map((r) => r.title));
        const title = taken.has(baseTitle)
            ? `${baseTitle} ${id.slice(0, 6)}`
            : baseTitle;

        const resume = generateResume({
            profile,
            mode: choice.mode,
            target,
            templateId: choice.templateId,
            id,
            title,
            now,
            // 通用简历：篇幅取舍后可能是精简过的集合，不再一律全选
            // 岗位专用简历：用户在「内容选择」步里勾出来的集合
            selection: choice.selection,
            // 用户在内容选择步里关掉的板块。缺了这一环，板块开关会变成
            // 纯装饰 —— 界面上关掉了，生成的简历里还在
            disabledSections: choice.disabledSections,
            tSection: tSection,
            certificateLabel: tSection("certificatesLabel"),
      languageLabel: tSection("languageLabel"),
        });

        addResume(resume);
        setIsCreateModalOpen(false);
        router.push({ to: "/app/workbench/$id", params: { id } });
    };

    // 同一投递目标下的版本号：按生成时间正序编号，最早的是 v1
    const versionLabels = useMemo(() => {
        const grouped: Record<string, string[]> = {};
        for (const [id, r] of Object.entries(resumes)) {
            const targetId = (r as any).snapshot?.jobTargetId;
            if (!targetId) continue;
            (grouped[targetId] ||= []).push(id);
        }

        const labels: Record<string, string> = {};
        for (const ids of Object.values(grouped)) {
            ids
                .sort((a, b) =>
                    new Date((resumes[a] as any).createdAt || 0).getTime() -
                    new Date((resumes[b] as any).createdAt || 0).getTime()
                )
                .forEach((id, i) => { labels[id] = `v${i + 1}`; });
        }
        return labels;
    }, [resumes]);

    const duplicateResume = async (resume: any) => {
        const { generateUUID } = await import("@/utils/uuid");
        const now = new Date().toISOString();
        
        const { id, ...rest } = resume;
        const newResume = {
            ...rest,
            id: generateUUID(),
            title: `${resume.title || t("dashboard.resumes.untitled")} - ${t("common.copy")}`,
            createdAt: now,
            updatedAt: now,
        };
        
        const resumeId = addResume(newResume);
        toast.success(t("previewDock.copyResume.success"));
    };

    const importResumeFromJson = async (file: File) => {
        const content = await file.text();
        const config = JSON.parse(content);
        const now = new Date().toISOString();
        const { generateUUID } = await import("@/utils/uuid");
        const { initialResumeState } = await import("@/config/initialResumeData");

        const newResume = {
            ...initialResumeState,
            ...config,
            id: generateUUID(),
            createdAt: now,
            updatedAt: now,
        };
        const resumeId = addResume(newResume);
        setActiveResume(resumeId);
        setIsImportDialogOpen(false);
        toast.success(t("dashboard.resumes.importSuccess"));
        router.push({ to: "/app/workbench/$id", params: { id: resumeId } });
    };

    const extractImagesFromPdf = async (file: File) => {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const buffer = await file.arrayBuffer();
        const typedPdfjs = pdfjs as any;

        typedPdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

        const loadingTask = typedPdfjs.getDocument({
            data: new Uint8Array(buffer),
        });
        const pdf = await loadingTask.promise;
        const pageImages: string[] = [];
        const totalPages = Math.min(pdf.numPages, MAX_PDF_IMPORT_PAGES);

        for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 2 });
            const widthScale = Math.min(1, PDF_MAX_IMAGE_WIDTH / baseViewport.width);
            const viewport = page.getViewport({ scale: 2 * widthScale });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d", { alpha: false });

            if (!context) {
                throw new Error("Unable to create canvas context");
            }

            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));

            await page.render({
                canvasContext: context,
                viewport,
            }).promise;

            const imageDataUrl = canvas.toDataURL("image/jpeg", PDF_IMAGE_QUALITY);
            pageImages.push(imageDataUrl);

            canvas.width = 0;
            canvas.height = 0;
        }

        return pageImages;
    };

    const importResumeFromPdf = async (file: File) => {
        // PDF 导入靠识图，key 是必需项；缺了就直接把人送到配置页，
        // 而不是发一个必然失败的请求
        if (!deepseekApiKey) {
            toast.error(t("dashboard.resumes.importDialog.aiConfigRequired"));
            router.push("/app/dashboard/ai");
            return;
        }

        const pdfImages = await extractImagesFromPdf(file);
        if (pdfImages.length === 0) {
            throw new Error("No extractable PDF pages");
        }

        const response = await fetch("/api/resume-import", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                images: pdfImages,
                apiKey: deepseekApiKey,
                model: deepseekModelId,
                modelType: "deepseek",
                locale,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            const message = data?.details
                ? `${data?.error || "Resume import failed"}\n${data.details}`
                : data?.error || "Resume import failed";
            throw new Error(message);
        }

        const aiResume = data?.resume
            ? data.resume
            : data?.choices?.[0]?.message?.content
                ? extractJsonContent(data.choices[0].message.content)
                : null;

        if (!aiResume) {
            throw new Error("Invalid AI response");
        }

        // 落到**职业数据库**，不是简历。
        //
        // 这条路径原来直接造一份简历 —— 那是上游的设计（简历即数据）。
        // 但本项目的架构是「数据库是唯一事实来源」：内容只进简历的话，
        // 导进来就用完了，享受不到匹配、复用、一库多版本生成。
        const imported = profileImportFromAiResult(aiResume, {
            skillGroupName: tSection("skills.importedGroupName"),
        });

        if (imported.entities.length === 0) {
            toast.error(t("dashboard.resumes.importDialog.pdfNothingExtracted"));
            return;
        }

        for (const entity of imported.entities) addEntity(entity);
        if (imported.skillGroup) addSkillGroup(imported.skillGroup);
        if (Object.keys(imported.basic).length > 0) updateBasic(imported.basic);

        setIsImportDialogOpen(false);
        toast.success(
            t("dashboard.resumes.importDialog.pdfSuccess", { count: imported.entities.length })
        );
        router.push("/app/dashboard/profile");
    };

    const handleJsonFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || isImporting) return;

        try {
            setIsImporting(true);
            await importResumeFromJson(file);
        } catch (error) {
            console.error("Import JSON error:", error);
            toast.error(t("dashboard.resumes.importError"));
        } finally {
            setIsImporting(false);
        }
    };

    const handlePdfFileChange = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || isImporting) return;

        try {
            setIsImporting(true);
            await importResumeFromPdf(file);
        } catch (error) {
            console.error("Import PDF error:", error);
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : t("dashboard.resumes.importDialog.pdfError");
            toast.error(message);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <ScrollArea className="h-[calc(100vh-2rem)] w-full">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex-1 space-y-6 py-8"
            >
                <motion.div
                    className="flex w-full items-center justify-center px-4"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                >
                    {hasConfiguredFolder ? (
                        <Alert className="mb-6 bg-green-50/50 dark:bg-green-950/30 border-green-200 dark:border-green-900">
                            <AlertDescription className="flex items-center justify-between">
                                <span className="text-green-700 dark:text-green-400">
                                    {t("dashboard.resumes.synced")}
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-4 hover:bg-green-100 dark:hover:bg-green-900"
                                    onClick={() => {
                                        router.push("/app/dashboard/settings");
                                    }}
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    {t("dashboard.resumes.view")}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <Alert
                            variant="destructive"
                            className="mb-6 bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
                        >
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t("dashboard.resumes.notice.title")}</AlertTitle>
                            <AlertDescription className="flex items-center justify-between">
                                <span className="text-red-700 dark:text-red-400">
                                    {t("dashboard.resumes.notice.description")}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="ml-4 hover:bg-red-100 dark:hover:bg-red-900"
                                    onClick={() => {
                                        router.push("/app/dashboard/settings");
                                    }}
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    {t("dashboard.resumes.notice.goToSettings")}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                </motion.div>

                <motion.div
                    className="px-4 sm:px-6 flex items-center justify-between"
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        {t("dashboard.resumes.myResume")}
                    </h1>
                    <div className="flex items-center space-x-2">
                        <AnimatedImportButton onClick={() => setIsImportDialogOpen(true)} t={t} />
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                        >
                            <Button
                                onClick={() => setIsCreateModalOpen(true)}
                                variant="default"
                                className="bg-primary text-primary-foreground hover:bg-coral-active"
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {t("dashboard.resumes.create")}
                            </Button>
                        </motion.div>
                    </div>
                </motion.div>

                <motion.div
                    className="flex-1 w-full p-3 sm:p-6"
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                >
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
                        <motion.div
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ type: "spring", stiffness: 400, damping: 17 }}
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            <Card
                                className={cn(
                                    "relative border border-dashed cursor-pointer transition-all duration-200 aspect-[210/297] flex flex-col",
                                    "hover:border-gray-400 hover:bg-muted",
                                    "dark:hover:border-primary dark:hover:bg-primary/10"
                                )}
                            >
                                <CardContent className="flex-1 p-0 text-center flex flex-col items-center justify-center">
                                    <motion.div
                                        className="mb-4 p-4 rounded-full bg-muted dark:bg-primary/10"
                                        whileHover={{ rotate: 90 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Plus className="h-8 w-8 text-gray-600 dark:text-primary" />
                                    </motion.div>
                                    <CardTitle className="text-xl text-foreground px-4">
                                        {t("dashboard.resumes.newResume")}
                                    </CardTitle>
                                    <CardDescription className="mt-2 text-muted-foreground px-4">
                                        {t("dashboard.resumes.newResumeDescription")}
                                    </CardDescription>
                                </CardContent>
                            </Card>
                        </motion.div>

                        <AnimatePresence>
                            {Object.entries(resumes)
                                .sort(([, a], [, b]) => {
                                    const dateA = new Date(a.createdAt || 0).getTime();
                                    const dateB = new Date(b.createdAt || 0).getTime();
                                    return dateB - dateA;
                                })
                                .map(([id, resume], index) => (
                                    <ResumeCardItem
                                        key={id}
                                        id={id}
                                        resume={resume}
                                        t={t}
                                        locale={locale}
                                        router={router}
                                        deleteResume={deleteResume}
                                        duplicateResume={duplicateResume}
                                        index={index}
                                        versionLabel={versionLabels[id]}
                                    />
                                ))}
                        </AnimatePresence>
                    </div>
                </motion.div>

                <CreateResumeWizard
                    open={isCreateModalOpen}
                    onOpenChange={setIsCreateModalOpen}
                    onComplete={handleWizardComplete}
                />

                <ImportResumeDialog
                    open={isImportDialogOpen}
                    isImporting={isImporting}
                    onOpenChange={setIsImportDialogOpen}
                    jsonFileInputRef={jsonFileInputRef}
                    pdfFileInputRef={pdfFileInputRef}
                    onJsonFileChange={handleJsonFileChange}
                    onPdfFileChange={handlePdfFileChange}
                />
            </motion.div>
        </ScrollArea>
    );
};
