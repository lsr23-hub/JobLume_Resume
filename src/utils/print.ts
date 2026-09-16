import { getFontFaceCss, normalizeFontFamily } from "@/utils/fonts";
import { getSafeFileName } from "@/utils/export";

/**
 * 调用浏览器打印功能导出 PDF。
 *
 * 这是唯一产出真实文字层 PDF 的路径 —— 浏览器打印引擎负责分页，
 * 结果可选中、可复制、可被 ATS 解析，且不依赖任何外部服务。
 * 代价是需要在系统打印对话框里选择「另存为 PDF」。
 */
export const exportResumeToBrowserPrint = async (
  resumeContent: HTMLElement,
  pagePadding: number,
  fontFamily?: string,
  title?: string
): Promise<void> => {
  const printFrame = document.createElement("iframe");
  printFrame.style.position = "absolute";
  printFrame.style.width = "1px";
  printFrame.style.height = "1px";
  printFrame.style.left = "-9999px";
  printFrame.style.top = "0";
  printFrame.style.visibility = "hidden";
  printFrame.style.zIndex = "-1";
  document.body.appendChild(printFrame);

  const iframeWindow = printFrame.contentWindow;
  if (!iframeWindow) {
    document.body.removeChild(printFrame);
    throw new Error("无法创建打印窗口");
  }

  try {
    iframeWindow.document.open();

    const clonedContent = resumeContent.cloneNode(true) as HTMLElement;
    const selectedFontFamily = normalizeFontFamily(fontFamily);
    const transformValue = clonedContent.style.transform || "";
    const match = transformValue.match(/scale\(([\d.]+)\)/);
    if (match) {
      const scale = Number(match[1]);
      if (Number.isFinite(scale) && scale > 0 && scale < 1) {
        // 打印时使用 zoom 参与分页布局计算，比 transform 更接近最终分页效果
        clonedContent.style.removeProperty("transform");
        clonedContent.style.removeProperty("transform-origin");
        clonedContent.style.setProperty("width", "100%");
        clonedContent.style.setProperty("zoom", String(scale));
      }
    }

    clonedContent.style.setProperty("font-family", selectedFontFamily, "important");
    const fontFaceStyles = await getFontFaceCss(selectedFontFamily);

    // 打印对话框默认用文档标题作为文件名
    const safeTitle = getSafeFileName(title);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
          <style>
            ${fontFaceStyles}

            @page {
              size: A4;
              margin: 0;
              padding: 0;
            }
            * {
              box-sizing: border-box;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              background: white !important;
              height: auto !important;
              overflow: visible !important;
            }
            body {
              font-family: ${selectedFontFamily};
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            #resume-preview {
              margin: 0 !important;
              padding: ${pagePadding}px !important;
              -webkit-box-decoration-break: clone;
              box-decoration-break: clone;
              font-family: ${selectedFontFamily} !important;
              background: white !important;
            }

            #print-content {
              width: 210mm;
              margin: 0 auto;
              padding: 0;
              background: white;
              box-shadow: none;
            }
            #print-content * {
              box-shadow: none !important;
            }

            #resume-preview .min-h-screen,
            #resume-preview .min-h-full,
            #resume-preview [style*="min-height"] {
              min-height: 0 !important;
            }
            
            .page-break-line {
              display: none;
            }

            ${Array.from(document.styleSheets)
              .map((sheet) => {
                try {
                  return Array.from(sheet.cssRules)
                    .map((rule) => rule.cssText)
                    .join("\n");
                } catch (e) {
                  console.warn("Could not copy styles from sheet:", e);
                  return "";
                }
              })
              .join("\n")}
          </style>
        </head>
        <body>
          <div id="print-content">
            ${clonedContent.outerHTML}
          </div>
        </body>
      </html>
    `;

    iframeWindow.document.write(htmlContent);
    iframeWindow.document.close();

    const printWhenReady = async () => {
      try {
        const doc = iframeWindow.document;

        // 等待字体加载
        if (doc.fonts?.ready) {
          await doc.fonts.ready;
        }

        // 等待所有图片加载完成
        const images = Array.from(doc.images);
        await Promise.all(
          images
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise<void>((resolve) => {
                  img.onload = () => resolve();
                  img.onerror = () => resolve();
                })
            )
        );

        // 给予额外的渲染帧缓冲
        await new Promise<void>((resolve) => {
          iframeWindow.requestAnimationFrame(() => {
            iframeWindow.requestAnimationFrame(() => resolve());
          });
        });

        iframeWindow.focus();
        iframeWindow.print();

        // 打印完成后清理iframe
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
        }, 1000);
      } catch (error) {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
        throw error;
      }
    };

    // await 而非 void：让打印过程的错误能冒泡给调用方，避免静默失败
    await printWhenReady();
  } catch (error) {
    if (document.body.contains(printFrame)) {
      document.body.removeChild(printFrame);
    }
    throw error;
  }
};
