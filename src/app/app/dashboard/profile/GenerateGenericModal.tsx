import { useMemo, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useResumeStore } from "@/store/useResumeStore";
import { SECTION_DEFS } from "@/config/sections";
import { rankGeneric } from "@/lib/profile/rankGeneric";
import { materialize } from "@/lib/profile/materialize";
import type { MenuSection } from "@/types/resume";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { generateUUID } from "@/utils/uuid";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GenerateGenericModal = ({ open, onOpenChange }: Props) => {
  const t = useTranslations("profile");
  const router = useRouter();
  const { profile } = useCareerProfileStore();
  const { addResume } = useResumeStore();

  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [disabledSections, setDisabledSections] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  /** 每个板块按「时效 × 同类衰减」排序；排序结果即默认勾选建议 */
  const ranked = useMemo(() => {
    if (!profile) return {};
    const now = Date.now();
    const bySection: Record<string, ReturnType<typeof rankGeneric>> = {};

    for (const def of SECTION_DEFS) {
      if (def.accepts.length === 0) continue;
      const entities = Object.values(profile.entities).filter(
        (e) => e.sectionId === def.id
      );
      if (entities.length > 0) bySection[def.id] = rankGeneric(entities, now);
    }
    return bySection;
  }, [profile]);

  // 首次打开时全选（用户看到的就是「默认建议」，可随意增删）
  if (open && !initialized && profile) {
    const initial: Record<string, string[]> = {};
    for (const [sectionId, list] of Object.entries(ranked)) {
      initial[sectionId] = list.map((r) => r.entity.id);
    }
    setSelected(initial);
    setInitialized(true);
  }
  if (!open && initialized) setInitialized(false);

  const toggleEntity = (sectionId: string, entityId: string) => {
    setSelected((prev) => {
      const current = prev[sectionId] ?? [];
      return {
        ...prev,
        [sectionId]: current.includes(entityId)
          ? current.filter((id) => id !== entityId)
          : [...current, entityId],
      };
    });
  };

  const toggleSection = (sectionId: string, enabled: boolean) => {
    setDisabledSections((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const handleGenerate = () => {
    if (!profile) return;

    // 必备板块锁定开启；但完全没有内容的板块不渲染 —— 否则模板会输出一个
    // 只有标题、下面空无一物的板块
    const hasContent = (sectionId: string): boolean => {
      if (sectionId === "basic") return true;
      if (sectionId === "skills") return profile.skillGroups.length > 0;
      if (sectionId === "certificates") return profile.certificates.length > 0;
      if (sectionId === "selfEvaluation") return profile.selfEvaluationContent.trim() !== "";
      return (selected[sectionId]?.length ?? 0) > 0;
    };

    const sections: MenuSection[] = SECTION_DEFS.map((def, index) => ({
      id: def.id,
      title: t(def.titleKey),
      icon: def.icon,
      enabled: (def.required || !disabledSections.has(def.id)) && hasContent(def.id),
      order: index,
    }));

    const now = new Date().toISOString();
    const id = generateUUID();

    const resume = materialize({
      profile,
      selection: selected,
      sections,
      meta: { id, title: t("generatedTitle"), now, templateId: "classic" },
      snapshot: { mode: "generic", jobTargetId: null, generatedAt: now },
    });

    addResume(resume);
    onOpenChange(false);
    toast.success(t("generateSuccess"));
    router.push(`/app/workbench/${id}`);
  };

  const totalSelected = Object.values(selected).reduce((sum, ids) => sum + ids.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("generic.title")}</DialogTitle>
          <DialogDescription>{t("generic.description")}</DialogDescription>
        </DialogHeader>

        {totalSelected === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("generic.noEntities")}
          </p>
        ) : (
          <div className="space-y-5 py-2">
            {SECTION_DEFS.map((def) => {
              const list = ranked[def.id];
              const isContentless = def.accepts.length === 0;

              if (isContentless) {
                return (
                  <div key={def.id} className="flex items-center gap-3 text-sm">
                    <Switch
                      checked={def.required || !disabledSections.has(def.id)}
                      disabled={def.required}
                      onCheckedChange={(v) => toggleSection(def.id, v)}
                    />
                    <span className="font-medium">
                      {def.icon} {t(def.titleKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {def.required ? t("generic.locked") : t("generic.emptySection")}
                    </span>
                  </div>
                );
              }

              if (!list?.length) return null;
              const sectionEnabled = def.required || !disabledSections.has(def.id);

              return (
                <div key={def.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={sectionEnabled}
                      disabled={def.required}
                      onCheckedChange={(v) => toggleSection(def.id, v)}
                    />
                    <span className="text-sm font-medium">
                      {def.icon} {t(def.titleKey)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("generic.orderNote")}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "space-y-1 transition-opacity",
                      !sectionEnabled && "pointer-events-none opacity-40"
                    )}
                  >
                    {list.map(({ entity, score, sameCategoryRank }) => {
                      const checked = (selected[def.id] ?? []).includes(entity.id);
                      const category = entity.tags[0];

                      return (
                        <label
                          key={entity.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition-colors",
                            checked ? "border-primary/40 bg-primary/5" : "border-border/60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!sectionEnabled}
                            onChange={() => toggleEntity(def.id, entity.id)}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {entity.title || t("untitled")}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[entity.subtitle, entity.dateRange].filter(Boolean).join(" · ")}
                            </span>
                          </span>

                          {category && (
                            <span
                              className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                              title={t("generic.sameCategoryNote", {
                                rank: sameCategoryRank,
                                score: score.toFixed(2),
                              })}
                            >
                              {category}
                              {sameCategoryRank > 1 && ` #${sameCategoryRank}`}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("generic.cancel")}
          </Button>
          <Button onClick={handleGenerate} disabled={totalSelected === 0}>
            {t("generic.confirm", { count: totalSelected })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
