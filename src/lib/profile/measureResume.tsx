import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import ResumeTemplateComponent from "@/components/templates";
import { A4_WIDTH_MM } from "./pageBudget";
import { resolveImagesInElement } from "@/lib/imageStore";
import { normalizeFontFamily, preloadFontFamily } from "@/utils/fonts";
import type { ResumeData } from "@/types/resume";
import type { ResumeTemplate } from "@/types/template";

/**
 * 离屏测量：按真实 A4 尺寸渲染一份简历 → 量高 → 丢弃。
 *
 * 用来回答「这份简历排出来是几页」。**不导出 PDF** —— 预览面板算页数用的
 * 就是这个高度（真实 DOM 高度，与 Puppeteer 导出一致），所以这里量到的是同一个数。
 *
 * 容器挂在视口外而非 `display: none`：后者不参与布局，量出来的高度是 0。
 * `visibility: hidden` 会参与布局，且不闪烁。
 *
 * 走 **portal** 而不是另起一个 React root：模板内部要用 i18n 语境
 * （`useLocale` / `useTranslations`），而 `createRoot` 出来的是另一棵树，
 * 拿不到外层 Provider，模板会整片抛错。
 */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/**
 * 给「只是让高度更准一点」的等待加上限。
 *
 * 图片解析要读 IndexedDB，任何一个不返回都会让整个测量永远挂着 ——
 * 而测量的调用方是一个正在转圈的对话框。宁可量得糙一点，也不能卡死。
 */
const withTimeout = (promise: Promise<unknown>, ms: number) =>
  Promise.race([
    promise.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);

interface Probe {
  data: ResumeData;
  template: ResumeTemplate;
  scaleFactor: number;
  resolve: (height: number) => void;
}

export interface ResumeMeasurer {
  /**
   * @param scaleFactor 预览按这个倍率缩放时，版面会相应加宽到 `210mm / scaleFactor`
   *   （见下），量出来的高度才是那时候的真实高度。
   * @returns 内容高度（px，**含上下 padding**，与预览面板的 `contentHeight` 同口径）
   */
  measure: (
    data: ResumeData,
    template: ResumeTemplate,
    scaleFactor?: number
  ) => Promise<number>;
  /** 挂在组件树里即可，不可见且不占位 */
  host: React.ReactNode;
}

export const useResumeMeasurer = (): ResumeMeasurer => {
  const [probe, setProbe] = useState<Probe | null>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const pendingResolve = useRef<((height: number) => void) | null>(null);

  const measure = useCallback(
    (data: ResumeData, template: ResumeTemplate, scaleFactor = 1) =>
      new Promise<number>((resolve) => {
        // 上一次还没量完就被顶掉了：给它一个高度为 0 的结果（等价于「一页装得下」），
        // 让调用方的 await 能继续走下去，而不是永远挂着
        pendingResolve.current?.(0);
        pendingResolve.current = resolve;
        setProbe({ data, template, scaleFactor, resolve });
      }),
    []
  );

  useEffect(() => {
    if (!probe) return;
    let cancelled = false;

    const run = async () => {
      const done = (height: number) => {
        if (cancelled) return;
        if (pendingResolve.current === probe.resolve) pendingResolve.current = null;
        probe.resolve(height);
      };

      const element = probeRef.current;
      // 量不到就报 0（等价于「一页装得下」）—— 调用方会照常生成，
      // 而不是永远转圈
      if (!element) return done(0);

      await preloadFontFamily(probe.data.globalSettings?.fontFamily);
      // 首帧出布局 → 图片就位 → 再量。少任何一步都会量到偏矮的高度
      await nextFrame();
      await withTimeout(resolveImagesInElement(element), 2000);
      await nextFrame();

      done(element.clientHeight);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const host =
    typeof document === "undefined"
      ? null
      : createPortal(
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              left: "-100000px",
              top: 0,
              width: `${A4_WIDTH_MM}mm`,
              visibility: "hidden",
              pointerEvents: "none",
              zIndex: -1,
            }}
          >
            {probe && (
              /* 版面宽度要跟着缩放倍率走 —— 预览正是这么做的：
                 缩到 0.9 倍时把宽度撑到 1/0.9，视觉上的换行位置才不变。
                 探针若固定按 210mm 排版，换行位置与预览不同，
                 量出来的页数就会跟用户在预览里看到的不一致。 */
              <div
                ref={probeRef}
                /* 这个类名不是装饰：全局样式里有一组
                   `#resume-preview X, .resume-preview X` 的规则（列表缩进、标题字体），
                   少了它就量不到真实高度 —— 列表没有缩进、没有上下外边距，
                   整份简历会矮一大截，页数就跟着算错。 */
                className="resume-preview"
                style={{
                  width: `${100 / probe.scaleFactor}%`,
                  transform: `scale(${probe.scaleFactor})`,
                  transformOrigin: "top left",
                  background: "#fff",
                  padding: `${probe.data.globalSettings?.pagePadding ?? 0}px`,
                  fontFamily: normalizeFontFamily(probe.data.globalSettings?.fontFamily),
                }}
              >
                <ResumeTemplateComponent data={probe.data} template={probe.template} />
              </div>
            )}
          </div>,
          document.body
        );

  return { measure, host };
};
