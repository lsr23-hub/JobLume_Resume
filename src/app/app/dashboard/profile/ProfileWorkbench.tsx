import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "@/i18n/compat/client";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { SECTION_DEFS } from "@/config/sections";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EntityList } from "./EntityList";
import { BasicPanel } from "./BasicPanel";
import { SkillGroupPanel } from "./SkillGroupPanel";
import { SelfEvaluationPanel } from "./SelfEvaluationPanel";
import { GenerateGenericModal } from "./GenerateGenericModal";
import { CertificatesPanel } from "./CertificatesPanel";
import { SaveBar } from "./SaveBar";
import { ImportProfileDialog } from "./ImportProfileDialog";

/** 走「条目列表」形态的板块；其余由专属面板负责 */
const ENTITY_SECTIONS = new Set([
  "education",
  "experience",
  "projects",
  "campus",
  "honors",
  "languages",
]);

export const ProfileWorkbench = () => {
  const t = useTranslations("profile");
  const { profile, ensureProfile } = useCareerProfileStore();
  const [activeSection, setActiveSection] = useState("basic");
  const [generateOpen, setGenerateOpen] = useState(false);

  useEffect(() => {
    ensureProfile();
  }, [ensureProfile]);

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entity of Object.values(profile?.entities ?? {})) {
      counts[entity.sectionId] = (counts[entity.sectionId] ?? 0) + 1;
    }
    return counts;
  }, [profile?.entities]);

  if (!profile) return null;

  const renderPanel = () => {
    if (activeSection === "basic") return <BasicPanel />;
    if (activeSection === "skills") return <SkillGroupPanel />;
    if (activeSection === "selfEvaluation") return <SelfEvaluationPanel />;

    if (activeSection === "certificates") return <CertificatesPanel />;

    if (ENTITY_SECTIONS.has(activeSection)) {
      return <EntityList sectionId={activeSection} />;
    }

    return <Placeholder title={t("unknownSection")} body="" />;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ImportProfileDialog />
          <Button onClick={() => setGenerateOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("generateGeneric")}
          </Button>
        </div>
      </header>

      {/* 窄屏：板块导航收成顶部横向滚动条；宽屏：左侧竖向栏 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <nav className="w-full min-w-0 shrink-0 overflow-x-auto border-b border-border/40 p-3 md:w-52 md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex gap-1 md:block">
          {SECTION_DEFS.map((section) => {
            const active = section.id === activeSection;
            const count = entityCounts[section.id] ?? 0;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "mb-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span aria-hidden>{section.icon}</span>
                <span className="flex-1 truncate">{t(section.titleKey)}</span>
                {count > 0 && (
                  <span className="shrink-0 text-xs tabular-nums opacity-60">{count}</span>
                )}
              </button>
            );
          })}
          </div>
        </nav>

        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">{renderPanel()}</div>
        </section>
      </div>

      <SaveBar />

      <GenerateGenericModal open={generateOpen} onOpenChange={setGenerateOpen} />
    </div>
  );
};

const Placeholder = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
    <p className="font-medium">{title}</p>
    {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
  </div>
);
