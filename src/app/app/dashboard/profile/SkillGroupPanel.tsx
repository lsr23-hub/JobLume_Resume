import { useState } from "react";
import { GripVertical, PlusCircle, Trash2 } from "lucide-react";
import { Reorder } from "framer-motion";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const SkillGroupPanel = () => {
  const t = useTranslations("profile");
  const { profile, addSkillGroup, updateSkillGroup, removeSkillGroup, setCertificateText } =
    useCareerProfileStore();
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

      {/* 证书：原为独立板块的图片画廊，现并入本板块，纯文本一行一条 */}
      <div className="space-y-1.5 border-t border-border/40 pt-4">
        <Label className="text-sm font-medium">{t("skills.certificateLabel")}</Label>
        <Textarea
          value={profile.certificateText ?? ""}
          onChange={(e) => setCertificateText(e.target.value)}
          placeholder={t("skills.certificatePlaceholder")}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">{t("skills.certificateNote")}</p>
      </div>
    </div>
  );
};
