import { useMemo, useState } from "react";
import { AnimatePresence, Reorder, motion } from "framer-motion";
import { ChevronDown, Eye, EyeOff, GripVertical, PlusCircle, Trash2 } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { ProfileEntity } from "@/types/profile";
import { getSectionDef } from "@/config/sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EntityEditor } from "./EntityEditor";

export const EntityList = ({ sectionId }: { sectionId: string }) => {
  const t = useTranslations("profile");
  const { profile, addEntity, updateEntity, removeEntity, reorderEntities } =
    useCareerProfileStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const entities = useMemo(
    () =>
      Object.values(profile?.entities ?? {})
        .filter((e) => e.sectionId === sectionId)
        .sort((a, b) => a.order - b.order),
    [profile?.entities, sectionId]
  );

  const sectionDef = getSectionDef(sectionId);

  const handleAdd = () => {
    const id = addEntity({
      sectionId,
      type: (sectionDef?.accepts[0] ?? "custom") as ProfileEntity["type"],
      title: t("newEntityTitle"),
      tags: [],
      skills: [],
      metrics: [],
    });
    setExpandedId(id);
  };

  return (
    <div className="space-y-3">
      {entities.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      )}

      <Reorder.Group
        axis="y"
        values={entities}
        onReorder={(next) => reorderEntities(sectionId, next.map((e) => e.id))}
        className="space-y-2"
      >
        {entities.map((entity) => {
          const expanded = expandedId === entity.id;
          const category = entity.tags[0];

          return (
            <Reorder.Item
              key={entity.id}
              value={entity}
              layout="position"
              className={cn(
                "rounded-xl border bg-card transition-colors",
                expanded ? "border-primary/40" : "border-border/60",
                entity.hidden && "opacity-50"
              )}
            >
              <div className="flex items-center gap-2 p-3">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />

                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : entity.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      expanded && "rotate-180"
                    )}
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
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {category}
                    </span>
                  )}
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title={entity.hidden ? t("show") : t("hide")}
                  onClick={() => updateEntity(entity.id, { hidden: !entity.hidden })}
                >
                  {entity.hidden ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeEntity(entity.id)}
                  aria-label={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "linear" }}
                    className="overflow-hidden border-t border-border/60"
                  >
                    <div className="p-4">
                      <EntityEditor entity={entity} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      <Button onClick={handleAdd} className="w-full" variant="outline">
        <PlusCircle className="mr-2 h-4 w-4" />
        {t("addEntity")}
      </Button>
    </div>
  );
};
