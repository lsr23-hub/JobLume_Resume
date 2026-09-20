
import { useState, useEffect } from "react";
import { EditorHeader } from "@/components/editor/EditorHeader";
import { SidePanel } from "@/components/editor/SidePanel";
import { EditPanel } from "@/components/editor/EditPanel";
import PreviewPanel from "@/components/preview";
import PreviewDock from "@/components/preview/PreviewDock";
import { MobileWorkbench } from "@/components/mobile/MobileWorkbench";
import { PanelResizeHandle } from "react-resizable-panels";
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useSavesSession } from "@/hooks/useSavesSession";
import { LeaveDialog } from "@/components/shared/LeaveDialog";
import { ConflictDialog } from "@/components/shared/ConflictDialog";

/** 三栏初始宽度百分比。折叠/聚焦的尺寸由下面的 effect 现算，不再预置常量 */
const DEFAULT_PANEL_SIZES = [20, 32, 48];

const DragHandle = () => {
  return (
    <PanelResizeHandle className="relative flex w-px items-center justify-center outline-none group cursor-col-resize">
      {/* 垂直分割线 - 最底层 */}
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 z-0 w-[1px] -translate-x-1/2 bg-border",
          "transition-colors duration-200",
          "group-hover:bg-primary/40 group-active:bg-primary/60 data-[resize-handle-state=drag]:bg-primary/60"
        )}
      />
      {/* 扩大拖拽区域热区 */}
      <div className="absolute inset-y-0 left-1/2 z-10 w-5 -translate-x-1/2 bg-transparent" />
      {/* 小椭圆胶囊 - 适当加宽 (w-2: 8px) 以便更加显眼 */}
      <div
        className={cn(
          "absolute top-1/2 left-1/2 z-20 h-7 w-2 -translate-x-1/2 -translate-y-1/2",
          "rounded-full border border-border/80 bg-card shadow-sm", // 强制实体背景
          "transition-all duration-200",
          "group-hover:border-primary/50 group-hover:scale-110",
          "group-active:border-primary group-active:scale-105"
        )}
      />
    </PanelResizeHandle>
  );
};

export const runtime = "edge";

export default function Home() {
  // 编辑器不在 DashboardLayout 之下，镜像得在这里也挂一次（start 是幂等的）
  useSavesSession();

  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [editPanelCollapsed, setEditPanelCollapsed] = useState(false);
  const [previewPanelCollapsed, setPreviewPanelCollapsed] = useState(false);
  const [panelSizes, setPanelSizes] = useState<number[]>(DEFAULT_PANEL_SIZES);

  const toggleSidePanel = () => {
    setSidePanelCollapsed(!sidePanelCollapsed);
  };

  const toggleEditPanel = () => {
    setEditPanelCollapsed(!editPanelCollapsed);
  };

  const togglePreviewPanel = () => {
    setPreviewPanelCollapsed(!previewPanelCollapsed);
  };

  const updateLayout = (sizes: number[]) => {
    setPanelSizes(sizes);
  };

  useEffect(() => {
    // 如果预览面板已经收起，则不需要自动收起侧边栏，因为空间足够
    if (previewPanelCollapsed) return;

    // 初始化检查屏幕宽度
    if (window.innerWidth < 1440) {
      setSidePanelCollapsed(true);
    }

    // 监听 resize
    const handleResize = () => {
      // 屏幕改变时，如果此时预览面板收起，也可以让侧边栏展开
      if (previewPanelCollapsed) return;

      if (window.innerWidth < 1440) {
        setSidePanelCollapsed(true);
      } else {
        setSidePanelCollapsed(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [previewPanelCollapsed]);

  useEffect(() => {
    document.body.classList.add("workbench-body-lock");
    return () => {
      document.body.classList.remove("workbench-body-lock");
    };
  }, []);

  useEffect(() => {
    let newSizes = [];

    // 侧边栏尺寸
    newSizes.push(sidePanelCollapsed ? 0 : 20);

    // 编辑区尺寸
    if (editPanelCollapsed) {
      newSizes.push(0);
    } else {
      if (sidePanelCollapsed) {
        newSizes.push(36);
      } else {
        if (previewPanelCollapsed) {
          newSizes.push(80);
        } else {
          newSizes.push(32);
        }
      }
    }

    // 预览区尺寸
    if (previewPanelCollapsed) {
      newSizes.push(0);
    } else {
      if (editPanelCollapsed && sidePanelCollapsed) {
        newSizes.push(100);
      } else {
        if (editPanelCollapsed) {
          newSizes.push(80);
        } else {
          // 如果侧边栏收起且编辑区展开，预览区占64，编辑区占36
          if (sidePanelCollapsed) {
            newSizes.push(64);
          } else {
            newSizes.push(48);
          }
        }
      }
    }

    // 确保总和为 100
    const total = newSizes.reduce((a, b) => a + b, 0);
    if (total < 100) {
      const lastNonZeroIndex = newSizes
        .map((size, index) => ({ size, index }))
        .filter(({ size }) => size > 0)
        .pop()?.index;

      if (lastNonZeroIndex !== undefined) {
        newSizes[lastNonZeroIndex] += 100 - total;
      }
    }
    updateLayout([...newSizes]);
  }, [sidePanelCollapsed, editPanelCollapsed, previewPanelCollapsed]);

  return (
    <main
      className={cn(
        "w-full min-h-screen  overflow-hidden",
        "w-full min-h-screen overflow-hidden",
        "bg-background text-foreground"
      )}
    >
      <EditorHeader />
      {/* 桌面端布局 */}
      <div className="hidden md:block h-[calc(100vh-64px)] relative flex w-full">
        <div className={cn(
          "h-full transition-all duration-300",
          previewPanelCollapsed ? "w-[calc(100%-4rem)]" : "w-full"
        )}>
          <ResizablePanelGroup
            key={panelSizes?.join("-")}
            direction="horizontal"
            className={cn(
              "h-full",
              "h-full",
              "border border-border bg-background"
            )}
          >
            {/* 侧边栏面板 */}
            {!sidePanelCollapsed && (
              <>
                <ResizablePanel
                  id="side-panel"
                  order={1}
                  defaultSize={panelSizes?.[0]}
                  className="bg-background"
                >
                  <div className="h-full overflow-y-auto">
                    <SidePanel />
                  </div>
                </ResizablePanel>
                <DragHandle />
              </>
            )}

            {/* 编辑面板 */}
            {!editPanelCollapsed && (
              <>
                <ResizablePanel
                  id="edit-panel"
                  order={2}
                  defaultSize={panelSizes?.[1]}
                  className="bg-background"
                >
                  <div className="h-full">
                    <EditPanel />
                  </div>
                </ResizablePanel>
                <DragHandle />
              </>
            )}
            {/* 预览面板 - 使用 CSS 隐藏而非条件渲染，确保导出时 #resume-preview 始终在 DOM 中 */}
            <ResizablePanel
              id="preview-panel"
              order={3}
              collapsible={false}
              defaultSize={panelSizes?.[2]}
              className={cn("bg-muted", previewPanelCollapsed && "hidden")}
            >
              <div
                className="h-full overflow-y-auto"
                data-preview-scroll-container="true"
              >
                <PreviewPanel />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <PreviewDock
          sidePanelCollapsed={sidePanelCollapsed}
          editPanelCollapsed={editPanelCollapsed}
          previewPanelCollapsed={previewPanelCollapsed}
          toggleSidePanel={toggleSidePanel}
          toggleEditPanel={toggleEditPanel}
          togglePreviewPanel={togglePreviewPanel}
        />
      </div>

      {/* 离开守卫与冲突对话框（编辑器不在 DashboardLayout 之下，得自己挂） */}
      <LeaveDialog />
      <ConflictDialog />

      {/* 移动端布局 */}
      <div className="md:hidden h-[calc(100vh-64px)]">
        <MobileWorkbench />
      </div>
    </main>
  );
}
