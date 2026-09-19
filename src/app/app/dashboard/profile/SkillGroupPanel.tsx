import { useState } from "react";
import { GripVertical, PlusCircle, Trash2 } from "lucide-react";
import { Reorder } from "framer-motion";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 固定分组行：证书奖项 / 语言能力。
 *
 * 形态与上面的技能分组一致（一行「名称 + 内容」），但**不可拖拽、不可删除** ——
 * `materialize` 固定把这两项排在技能板块的最后，允许拖动位置就是在撒谎。
 * 名称也不可改：它同时是简历上的行首标签，来自 i18n。
 */
const FixedRow = ({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) => (
  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card p-3">
    {/* 两个占位块对应分组行的拖拽把手与删除按钮，保证各列对齐 */}
    <span className="h-4 w-4 shrink-0" aria-hidden />
    <span className="w-36 shrink-0 truncate text-sm font-medium">{label}</span>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1"
    />
    <span className="h-8 w-8 shrink-0" aria-hidden />
  </div>
);

export const SkillGroupPanel = () => {
  const t = useTranslations("profile");
  const {
    profile,
    addSkillGroup,
    updateSkillGroup,
    removeSkillGroup,
    setCertificateText,
    setLanguageText,
  } = useCareerProfileStore();
  const [draftName, setDraftName] = useState("");

  if (!profile) return null;
  const groups = [...profile.skillGroups].sort((a, b) => a.order - b.order);

  const handleAdd = () => {
    addSkillGroup({ name: draftName.trim() || t("skills.defaultGroupName"), content: "" });
    setDraftName("");
  };

  return (
    <div className="space-y-3">
      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("skills.empty")}</p>
        </div>
      )}

      <Reorder.Group
        axis="y"
        values={groups}
        onReorder={(next) => next.forEach((g, i) => updateSkillGroup(g.id, { order: i }))}
        className="space-y-2"
      >
        {groups.map((group) => (
          <Reorder.Item
            key={group.id}
            value={group}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card p-3"
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
            <Input
              value={group.name}
              onChange={(e) => updateSkillGroup(group.id, { name: e.target.value })}
              placeholder={t("skills.groupName")}
              className="w-36 shrink-0"
            />
            <Input
              value={group.content}
              onChange={(e) => updateSkillGroup(group.id, { content: e.target.value })}
              placeholder={t("skills.contentPlaceholder")}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeSkillGroup(group.id)}
              aria-label={t("delete")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {/* 证书 / 语言：原为两个独立文本框吊在列表下方，现改为与分组同形的一行 */}
      <div className="space-y-2">
        <FixedRow
          label={t("skills.certificateLabel")}
          value={profile.certificateText ?? ""}
          placeholder={t("skills.certificatePlaceholder")}
          onChange={setCertificateText}
        />
        <FixedRow
          label={t("skills.languageLabel")}
          value={profile.languageText ?? ""}
          placeholder={t("skills.languagePlaceholder")}
          onChange={setLanguageText}
        />
      </div>

      <div className="flex gap-2">
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={t("skills.newGroupPlaceholder")}
        />
        <Button onClick={handleAdd} variant="outline" className="shrink-0">
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("skills.addGroup")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("skills.note")}</p>
    </div>
  );
};
