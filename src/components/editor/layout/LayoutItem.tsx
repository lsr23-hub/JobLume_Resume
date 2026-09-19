
import { motion, Reorder, useDragControls } from "framer-motion";
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MenuSection } from "@/types/resume";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "@/i18n/compat/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface LayoutItemProps {
  item: MenuSection;
  isBasic?: boolean;
  activeSection: string;
  setActiveSection: (id: string) => void;
  toggleSectionVisibility: (id: string) => void;
  updateMenuSections: (sections: MenuSection[]) => void;
  removeCustomData: (sectionId: string) => void;
  menuSections: MenuSection[];
  /** 该板块当前生效的展示设置（覆盖优先，否则取全局默认） */
  display: { centerSubtitle: boolean; flexibleHeaderLayout: boolean };
  /** 写该板块的展示覆盖 */
  onToggleDisplay: (patch: { centerSubtitle?: boolean; flexibleHeaderLayout?: boolean }) => void;
  /** 仅基本信息用：图标模式 */
  useIconMode?: boolean;
  onToggleIconMode?: (on: boolean) => void;
}

const LayoutItem = ({
  item,
  isBasic = false,
  activeSection,
  setActiveSection,
  toggleSectionVisibility,
  updateMenuSections,
  removeCustomData,
  menuSections,
  display,
  onToggleDisplay,
  useIconMode,
  onToggleIconMode,
}: LayoutItemProps) => {
  const dragControls = useDragControls();
  const t = useTranslations("common");
  const tSide = useTranslations("workbench.sidePanel");

  /**
   * 板块级的展示开关。
   *
   * 只在**该板块被选中时**展开 —— 十个板块各挂两个开关，常显会把列表淹掉。
   */
  const displayToggles = (
    <div className="space-y-2 border-t border-border/60 px-3 py-3" onClick={(e) => e.stopPropagation()}>
      {onToggleIconMode && (
        <ToggleRow
          label={tSide("mode.useIconMode.title")}
          checked={Boolean(useIconMode)}
          onChange={onToggleIconMode}
        />
      )}
      <ToggleRow
        label={tSide("mode.centerSubtitle.title")}
        checked={display.centerSubtitle}
        onChange={(v) => onToggleDisplay({ centerSubtitle: v })}
      />
      <ToggleRow
        label={tSide("mode.flexibleHeaderLayout.title")}
        checked={display.flexibleHeaderLayout}
        onChange={(v) => onToggleDisplay({ flexibleHeaderLayout: v })}
      />
    </div>
  );

  if (isBasic) {
    return (
      <div
        className={cn(
          "rounded-lg group border mb-2",
          "bg-card border-border",
          "hover:border-primary/50 transition-colors",
          activeSection === item.id &&
          "border-primary text-primary ring-1 ring-primary"
        )}
        onClick={() => setActiveSection(item.id)}
      >
        <div className="flex items-center p-3 pl-[32px] space-x-3">
          <span
            className={cn(
              "text-lg  ml-[12px]",
              "text-muted-foreground group-hover:text-foreground transition-colors"
            )}
          >
            {item.icon}
          </span>
          <span className={cn("text-sm flex-1 cursor-pointer")}>
            {item.title}
          </span>
        </div>
        {activeSection === item.id && displayToggles}
      </div>
    );
  }

  return (
    <Reorder.Item
      id={item.id}
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className={cn(
        "rounded-lg group border flex flex-col overflow-hidden ",
        "bg-card border-border",
        "hover:border-primary/50 transition-colors",
        activeSection === item.id &&
        "border-primary text-primary ring-1 ring-primary"
      )}
      whileHover={{ scale: 1.01 }}
      whileDrag={{ scale: 1.02 }}
    >
      <div className="flex">
      <div
        onPointerDown={(event) => {
          dragControls.start(event);
        }}
        className={cn(
          "w-8 flex items-center justify-center  touch-none shrink-0",
          "border-border",
          "cursor-grab hover:bg-muted/50"
        )}
      >
        <GripVertical
          className={cn(
            "w-4 h-4",
            "text-muted-foreground",
            "transform transition-transform group-hover:scale-110"
          )}
        />
      </div>

      <div
        className="flex select-none items-center p-3 space-x-3 flex-1  cursor-pointer"
        onClick={() => setActiveSection(item.id)}
      >
        <div className="flex flex-1 items-center">
          <span
            className={cn(
              "text-lg mr-2",
              "text-muted-foreground group-hover:text-foreground transition-colors"
            )}
          >
            {item.icon}
          </span>
          <span className="text-sm flex-1">{item.title}</span>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              toggleSectionVisibility(item.id);
            }}
            className={cn(
              "p-1.5 rounded-md mr-2",
              "hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            )}
          >
            {item.enabled ? (
              <Eye className="w-4 h-4 text-primary" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </motion.button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "p-1.5 rounded-md text-primary",
                  "hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                )}
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </motion.button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("delete")} {item.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteModuleConfirm")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={(e) => e.stopPropagation()}>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.stopPropagation();
                    const updatedSections = menuSections.filter(
                      (section) => section.id !== item.id
                    );
                    const currentIndex = menuSections.findIndex(
                      (section) => section.id === item.id
                    );
                    const fallbackSection =
                      menuSections[currentIndex - 1] ?? updatedSections[0];

                    updateMenuSections(updatedSections);
                    if (item.id.startsWith("custom")) {
                      removeCustomData(item.id);
                    }
                    if (fallbackSection) {
                      setActiveSection(fallbackSection.id);
                    }
                  }}
                  className="bg-gradient-to-r from-rose-500 to-orange-400 hover:from-rose-600 hover:to-orange-500 text-white shadow-sm border-0"
                >
                  {t("confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      </div>
      {activeSection === item.id && displayToggles}
    </Reorder.Item>
  );
};

const ToggleRow = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) => (
  <label className="flex items-center justify-between gap-3">
    <span className="text-xs text-muted-foreground">{label}</span>
    <Switch className="scale-90" checked={checked} onCheckedChange={onChange} />
  </label>
);

export default LayoutItem;
