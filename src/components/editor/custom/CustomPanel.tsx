import { memo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reorder } from "framer-motion";
import { PlusCircle } from "lucide-react";
import CustomItem from "./CustomItem";
import { useResumeStore } from "@/store/useResumeStore";
import { CustomItem as CustomItemType } from "@/types/resume";
import { getSectionDef } from "@/config/sections";
import { SectionItemsPicker } from "@/components/editor/shared/SectionItemsPicker";
import { useAddSectionEntities } from "@/components/editor/shared/useAddSectionEntities";
import { useEnsureSectionEnabled } from "@/components/editor/shared/useEnsureSectionEnabled";

const CustomPanel = memo(({ sectionId }: { sectionId: string }) => {
  const { addCustomItem, updateCustomData, activeResume } = useResumeStore();
  const addFromProfile = useAddSectionEntities();
  const ensureEnabled = useEnsureSectionEnabled();
  const { customData } = activeResume || {};
  const items = customData?.[sectionId] || [];
  const handleCreateItem = () => {
    addCustomItem(sectionId);
    ensureEnabled(sectionId);
  };

  // 校园经历 / 获奖情况在职业数据库里有对应板块；
  // 用户自建的模块没有，那种情况保持原来的「只加空白」。
  // （语言能力已并入专业技能的固定分组，不再是独立板块。）
  const hasProfileSection = Boolean(getSectionDef(sectionId));

  return (
    <div
      className={cn(
        "space-y-4 px-4 py-4 rounded-lg",
        "bg-card"
      )}
    >
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={(newOrder) => {
          updateCustomData(sectionId, newOrder);
        }}
        className="space-y-3"
      >
        {items.map((item: CustomItemType) => (
          <CustomItem key={item.id} item={item} sectionId={sectionId} />
        ))}

        {hasProfileSection ? (
          <SectionItemsPicker
            sectionId={sectionId}
            existingIds={items.map((item) => item.id)}
            label="添加"
            onCreateBlank={handleCreateItem}
            onAdd={(entities) => addFromProfile(sectionId, entities)}
          />
        ) : (
          <Button onClick={handleCreateItem} className={cn("w-full")}>
            <PlusCircle className="w-4 h-4 mr-2" />
            添加
          </Button>
        )}
      </Reorder.Group>
    </div>
  );
});

CustomPanel.displayName = "CustomPanel";

export default CustomPanel;
