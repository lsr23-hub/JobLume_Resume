import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Database, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSectionDef } from "@/config/sections";
import { useTranslations } from "@/i18n/compat/client";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import type { ProfileEntity } from "@/types/profile";

interface Props {
  /** 简历板块 id。与数据库板块 id 相同 —— 这是 `SECTION_DEFS` 定下的约定 */
  sectionId: string;

  /** 简历里已有的条目 id，用来把「已经加过」的标出来 */
  existingIds: string[];

  /** 触发按钮的文案，沿用各面板原来的「添加 XX」 */
  label: string;

  /** 保留原有的空白新增 */
  onCreateBlank: () => void;

  /** 从数据库加入。已在简历里的不会出现在这里 */
  onAdd: (entities: ProfileEntity[]) => void;
}

/**
 * 板块的「添加」入口。
 *
 * 点开先看到职业数据库里这个板块的条目，勾一条或多条加入；
 * 想从零写一条时用对话框里的「新建空白」。
 *
 * **只读数据库**：加入的条目是副本，之后在简历里怎么改都不会写回数据库。
 */
export const SectionItemsPicker = ({
  sectionId,
  existingIds,
  label,
  onCreateBlank,
  onAdd,
}: Props) => {
  const t = useTranslations();
  const tSection = useTranslations("profile");
  const router = useRouter();
  const { profile } = useCareerProfileStore();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const def = getSectionDef(sectionId);
  const sectionTitle = def ? tSection(def.titleKey) : sectionId;

  /** 数据库里这个板块的全部条目（不含已隐藏的） */
  const inProfile = useMemo(
    () =>
      Object.values(profile?.entities ?? {})
        .filter((e) => e.sectionId === sectionId && !e.hidden)
        .sort((a, b) => a.order - b.order),
    [profile, sectionId]
  );

  // existingIds 每次渲染都是新数组，用它的内容做依赖
  const existingKey = existingIds.join("|");
  const candidates = useMemo(() => {
    const taken = new Set(existingKey ? existingKey.split("|") : []);
    return inProfile.filter((e) => !taken.has(e.id));
  }, [inProfile, existingKey]);

  // 「数据库里没有」和「都已经在简历里了」是两回事 —— 说成同一句会让人以为数据丢了
  const profileEmpty = inProfile.length === 0;

  const openDialog = () => {
    setPicked([]);
    setOpen(true);
  };

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = () => {
    const selected = candidates.filter((e) => picked.includes(e.id));
    if (selected.length === 0) return;
    onAdd(selected);
    setOpen(false);
  };

  return (
    <>
      <Button onClick={openDialog} className="w-full">
        <PlusCircle className="w-4 h-4 mr-2" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg">
              {t("workbench.addFromProfile.title", { section: sectionTitle })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("workbench.addFromProfile.desc")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[46vh]">
            <div className="px-6 pb-2 space-y-2">
              {candidates.length === 0 ? (
                profileEmpty ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-8 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("workbench.addFromProfile.empty", { section: sectionTitle })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        router.push("/app/dashboard/profile");
                      }}
                    >
                      <Database className="mr-2 h-4 w-4" />
                      {t("workbench.addFromProfile.goFill")}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("workbench.addFromProfile.allAdded")}
                    </p>
                  </div>
                )
              ) : (
                candidates.map((entity) => {
                  const active = picked.includes(entity.id);
                  return (
                    <motion.button
                      key={entity.id}
                      type="button"
                      whileTap={{ scale: 0.99 }}
                      onClick={() => toggle(entity.id)}
                      className={cn(
                        "w-full text-left rounded-xl border p-3 transition-colors flex items-start gap-3",
                        active
                          ? "border-primary/60 bg-primary/5"
                          : "border-border/60 hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                          active ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">{entity.title}</span>
                        {entity.subtitle && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {entity.subtitle}
                          </span>
                        )}
                        {entity.dateRange && (
                          <span className="block text-xs text-muted-foreground/70 mt-0.5">
                            {entity.dateRange}
                          </span>
                        )}
                      </span>
                    </motion.button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                onCreateBlank();
              }}
            >
              {t("workbench.addFromProfile.blank")}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" disabled={picked.length === 0} onClick={confirm}>
                {t("workbench.addFromProfile.confirm", { count: picked.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
