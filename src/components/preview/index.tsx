
import React, { useEffect, useMemo, useState, useRef } from "react";
import throttle from "lodash/throttle";
import { toast } from "sonner";
import { DEFAULT_TEMPLATES } from "@/config";
import { resolveImagesInElement } from "@/lib/imageStore";
import { cn } from "@/lib/utils";
import { useResumeStore } from "@/store/useResumeStore";
import { useImageEpoch } from "@/hooks/useImageEpoch";
import { useAutoOnePage } from "@/hooks/useAutoOnePage";
import { useTranslations } from "@/i18n/compat/client";
import { normalizeFontFamily } from "@/utils/fonts";
import ResumeTemplateComponent from "../templates";

/**
 * 面板折叠状态**不在这里** —— 早期版本把 6 个折叠相关的 props 传进来，
 * 但函数体从未读过它们（实测逐名 grep：只出现在声明与解构两处）。
 * 折叠由外层 `workbench/[id]/page.tsx` 与 `MobileWorkbench` 自己控制。
 */
interface PreviewPanelProps {}

const PageBreakLine = React.memo(
  ({
    pageNumber,
    contentPerPagePx,
    pagePadding,
  }: {
    pageNumber: number;
    contentPerPagePx: number;
    pagePadding: number;
  }) => {
    // 预览中 #resume-preview 有 padding-top，内容从 pagePadding 位置开始
    // 每页能容纳 contentPerPagePx 高度的内容（与 Puppeteer PDF margin 一致）
    // 第 N 页结束位置 = pagePadding + N * contentPerPagePx
    const top = pagePadding + pageNumber * contentPerPagePx;

    return (
      <div
        className="absolute left-0 right-0 pointer-events-none page-break-line"
        style={{ top: `${top}px` }}
      >
        <div className="relative w-full">
          <div className="absolute w-full border-t-2 border-dashed border-red-400" />
          <div className="absolute right-0 -top-6 text-xs text-red-500">
            第{pageNumber}页结束
          </div>
        </div>
      </div>
    );
  }
);

PageBreakLine.displayName = "PageBreakLine";

const PreviewPanel = React.forwardRef<HTMLDivElement, PreviewPanelProps>(
  (
    _props,
    ref
  ) => {
    const { activeResume, setActiveSection } = useResumeStore();
    // 图片字节可能是后到的（缓存没有时从磁盘拉）—— 引用没变，只有这个信号能触发再解析
    const imageEpoch = useImageEpoch();
    const selectedFontFamily = normalizeFontFamily(
      activeResume?.globalSettings?.fontFamily
    );
    const t = useTranslations("previewDock");
    const template = useMemo(() => {
      return (
        DEFAULT_TEMPLATES.find((t) => t.id === activeResume?.templateId) ||
        DEFAULT_TEMPLATES[0]
      );
    }, [activeResume?.templateId]);

    const internalResumeContentRef = useRef<HTMLDivElement>(null);
    const resumeContentRef = (ref as React.MutableRefObject<HTMLDivElement>) || internalResumeContentRef;
    const [contentHeight, setContentHeight] = useState(0);

    const updateContentHeight = () => {
      if (resumeContentRef.current) {
        const height = resumeContentRef.current.clientHeight;
        if (height > 0) {
          if (height !== contentHeight) {
            setContentHeight(height);
          }
        }
      }
    };

    useEffect(() => {
      const debouncedUpdate = throttle(() => {
        requestAnimationFrame(() => {
          updateContentHeight();
        });
      }, 100);

      const observer = new MutationObserver(debouncedUpdate);

      if (resumeContentRef.current) {
        observer.observe(resumeContentRef.current, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        updateContentHeight();
      }

      const resizeObserver = new ResizeObserver(debouncedUpdate);

      if (resumeContentRef.current) {
        resizeObserver.observe(resumeContentRef.current);
      }

      return () => {
        observer.disconnect();
        resizeObserver.disconnect();
      };
    }, []);

    useEffect(() => {
      if (activeResume) {
        const timer = setTimeout(updateContentHeight, 300);
        return () => clearTimeout(timer);
      }
    }, [activeResume]);

    // 图片引用（idb:）解析成 blob: URL。
    // 必须在此刻完成 —— 上游的导出逻辑（optimizeImages 等）处理的是
    // DOM 中已渲染的图片，若拖到导出阶段解析会因异步时序丢图。
    //
    // 直接改 DOM 而非走 React state：React 只在属性值变化时才更新 DOM，
    // 这里 img.src 的 prop 值（idb: 引用）没变，因此改写不会被覆盖。
    // deps 覆盖「数据变化」与「模板切换」两类会重建 img 元素的情况。
    useEffect(() => {
      const element = resumeContentRef.current;
      if (!element) return;
      void resolveImagesInElement(element).catch((error) =>
        console.warn("图片引用解析失败:", error)
      );
      // imageEpoch：字节从磁盘拉回来时引用没变，只有这个信号能触发再解析一次
    }, [activeResume, template, imageEpoch]);

    const pagePadding = activeResume?.globalSettings?.pagePadding || 0;
    const autoOnePageEnabled = activeResume?.globalSettings?.autoOnePage || false;
    const pageBreakLinesVisible =
      activeResume?.globalSettings?.pageBreakLinesVisible !== false;

    const { scaleFactor, isScaled, cannotFit } = useAutoOnePage({
      contentHeight,
      pagePadding,
      enabled: autoOnePageEnabled,
    });

    useEffect(() => {
      if (cannotFit) {
        toast.warning(t("autoOnePage.cannotFit"), {
          duration: 4000,
        });
      }
    }, [cannotFit, t]);

    const { contentPerPagePx, pageBreakCount } = useMemo(() => {
      const MM_TO_PX = 3.78;
      const A4_HEIGHT_PX = 297 * MM_TO_PX;

      // 与 Puppeteer PDF 导出一致：margin: pagePadding px（上下各一份）
      // 每页可用内容高度 = A4 总高度 - 上 margin - 下 margin
      const baseContentPerPage = A4_HEIGHT_PX - 2 * pagePadding;

      // 一页纸模式启用且内容能完美一页时，才隐藏分页线
      // cannotFit 时内容仍超出一页，需要保留分页线
      if ((isScaled && !cannotFit) || contentHeight <= 0) {
        return { contentPerPagePx: baseContentPerPage, pageBreakCount: 0 };
      }

      // 缩放时，在容器本地坐标系下每页能容纳更多内容
      // 因为视觉上 effectiveContentPerPage * scaleFactor = baseContentPerPage
      const effectiveContentPerPage = isScaled
        ? baseContentPerPage / scaleFactor
        : baseContentPerPage;

      // contentHeight 包含 #resume-preview 的 padding（上+下）
      // 实际内容高度 = contentHeight - 2 * pagePadding
      const actualContentHeight = contentHeight - 2 * pagePadding;
      const pageCount = Math.max(1, Math.ceil(actualContentHeight / effectiveContentPerPage));
      const pageBreakCount = Math.max(0, pageCount - 1);

      return { contentPerPagePx: effectiveContentPerPage, pageBreakCount };
    }, [contentHeight, pagePadding, isScaled, cannotFit, scaleFactor]);

    if (!activeResume) return null;

    const handlePreviewClickCapture = (
      event: React.MouseEvent<HTMLDivElement>
    ) => {
      const target = event.target as HTMLElement | null;
      const sectionElement = target?.closest<HTMLElement>(
        "[data-resume-section-id]"
      );
      const sectionId = sectionElement?.dataset.resumeSectionId;

      if (!sectionId || sectionId === activeResume.activeSection) {
        return;
      }

      setActiveSection(sectionId);
    };

    return (
      <div
        className="relative w-full h-full  bg-muted"
        style={{
          fontFamily: selectedFontFamily,
        }}
      >
        <div className="py-4 ml-4 px-4 min-h-screen flex justify-center scale-[58%] origin-top md:scale-90 md:origin-top-left">
          <div
            className={cn(
              "w-[210mm] min-w-[210mm] min-h-[297mm]",
              "bg-white",
              "shadow-lg",
              "relative mx-auto"
            )}
          >
            <div
              ref={resumeContentRef}
              id="resume-preview"
              onClickCapture={handlePreviewClickCapture}
              style={{
                fontFamily: selectedFontFamily,
                padding: `${activeResume.globalSettings?.pagePadding}px`,
                ...(isScaled
                  ? {
                    transform: `scale(${scaleFactor})`,
                    transformOrigin: "top left",
                    width: `${100 / scaleFactor}%`,
                  }
                  : {}),
              }}
              className="relative"
            >
              <ResumeTemplateComponent data={activeResume} template={template} />
              {pageBreakLinesVisible && contentHeight > 0 && (
                <>
                  <div key={`page-breaks-container-${contentHeight}`}>
                    {Array.from(
                      { length: Math.min(pageBreakCount, 20) },
                      (_, i) => {
                        const pageNumber = i + 1;

                        const pageLinePosition =
                          pagePadding + pageNumber * contentPerPagePx;

                        if (pageLinePosition <= contentHeight) {
                          return (
                            <PageBreakLine
                              key={`page-break-${pageNumber}`}
                              pageNumber={pageNumber}
                              contentPerPagePx={contentPerPagePx}
                              pagePadding={pagePadding}
                            />
                          );
                        }
                        return null;
                      }
                    ).filter(Boolean)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  });

PreviewPanel.displayName = "PreviewPanel";

export default PreviewPanel;
