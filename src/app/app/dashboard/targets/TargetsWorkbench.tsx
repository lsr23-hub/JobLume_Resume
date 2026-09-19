import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "@/i18n/compat/client";
import { useJobTargetStore, selectSortedTargets } from "@/store/useJobTargetStore";
import { useCareerProfileStore } from "@/store/useCareerProfileStore";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { analyzeMatch } from "@/lib/match/analyzeMatch";
import { buildEntityFingerprints, checkCache } from "@/lib/match/analysisCache";
import type { JobTarget } from "@/types/jobTarget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { RequirementList } from "./RequirementList";
import { FitLevelPanel } from "./FitLevelPanel";

export const TargetsWorkbench = () => {
  const t = useTranslations("targets");

  const { targets, addTarget, updateTarget, removeTarget, setAnalysis } = useJobTargetStore();
  const { profile } = useCareerProfileStore();
  const ai = useAIConfigStore();

  const list = useMemo(() => selectSortedTargets(targets), [targets]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = selectedId ? targets[selectedId] : null;

  const [isCreating, setIsCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = useMemo(
    () =>
      Object.values(profile?.entities ?? {}).filter((e) => !e.hidden),
    [profile?.entities]
  );

  useEffect(() => {
    setError(null);
  }, [selectedId]);

  const aiReady = Boolean(ai.deepseekApiKey.trim());

  /**
   * 现在展示的分析结果是不是基于修改前的数据。
   *
   * 这个判定只能在渲染时算 —— 用户改完经历并不触发重新分析，界面上那份结果
   * 就这么留着了，而缓存判定（`checkCache`）明明能说出「哪几条变了」。
   * 此前它算出来只用于一句 toast，用户看不到「你现在看的是旧结果」。
   */
  const staleAnalysis = useMemo(() => {
    if (!current?.matchAnalysis || !current.analysisCache) return null;
    const verdict = checkCache(current.analysisCache, {
      entityFingerprints: buildEntityFingerprints(entities),
      jdRaw: current.jdRaw,
      modelId: current.matchAnalysis.modelId,
    });
    return verdict.reusable ? null : verdict;
  }, [current?.analysisCache, current?.matchAnalysis, current?.jdRaw, entities]);

  const buildConfig = () => ({
    apiKey: ai.deepseekApiKey,
    model: ai.deepseekModelId,
    modelType: "deepseek" as const,
  });

  const handleCreate = (input: { company: string; position: string; jdRaw: string }) => {
    const id = addTarget(input);
    setSelectedId(id);
    setIsCreating(false);
  };

  const handleAnalyze = async (force = false) => {
    if (!current || !profile) return;
    if (!aiReady) {
      setError(t("needApiKey"));
      return;
    }

    setRunning(true);
    setError(null);

    const outcome = await analyzeMatch({
      target: current,
      entities,
      config: buildConfig(),
      now: new Date().toISOString(),
      cache: current.analysisCache,
      cachedAnalysis: current.matchAnalysis,
      force,
    });

    setRunning(false);

    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }

    if (outcome.fromCache) {
      // 缓存命中时不重跑是设计意图（保证结果零变化），但必须让用户知道
      // 按钮为什么「没反应」，否则会以为功能坏了
      toast.info(t("usedCache"));
    } else {
      setAnalysis(current.id, outcome.analysis, outcome.cache);
    }
    // 只数 entity 维度。要求维度的降级（一条缺证据就记一条）动辄十几条，
    // 混进这个计数会把 toast 变成噪音 —— 那些问题在要求项面板里就地显示
    const entityCorrections = outcome.corrections.filter((c) => c.scope === "entity");
    if (entityCorrections.length > 0) {
      toast.warning(t("corrections", { count: entityCorrections.length }));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border/40 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          {t("newTarget")}
        </Button>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        <nav className="w-full min-w-0 shrink-0 overflow-x-auto border-b border-border/40 p-3 md:w-64 md:overflow-y-auto md:border-b-0 md:border-r">
          <div className="flex gap-1 md:block">
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {list.map((target) => {
            const active = target.id === selectedId;
            const recommended = target.matchAnalysis?.summary.recommendedCount;
            return (
              <button
                key={target.id}
                onClick={() => setSelectedId(target.id)}
                className={cn(
                  "mb-1 flex shrink-0 items-start gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left transition-colors md:w-full",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{target.company}</span>
                  <span className="block truncate text-xs opacity-70">{target.position}</span>
                </span>
                {recommended !== undefined && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                    {recommended}
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </nav>

        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            {isCreating && (
              <TargetEditor
                onCancel={() => setIsCreating(false)}
                onSubmit={handleCreate}
              />
            )}

            {!isCreating && !current && (
              <div className="rounded-xl border border-dashed border-border/60 p-12 text-center">
                <p className="text-sm text-muted-foreground">{t("selectOrCreate")}</p>
              </div>
            )}

            {!isCreating && current && (
              <div className="space-y-6">
                <TargetEditor
                  target={current}
                  onCancel={() => setSelectedId(null)}
                  onSubmit={(input) => updateTarget(current.id, input)}
                  onDelete={() => {
                    removeTarget(current.id);
                    setSelectedId(null);
                  }}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => handleAnalyze(false)} disabled={running || !aiReady}>
                    {running ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("analyzing")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {current.matchAnalysis ? t("reanalyze") : t("analyze")}
                      </>
                    )}
                  </Button>

                  {current.matchAnalysis && !running && (
                    <>
                      <Button variant="outline" onClick={() => handleAnalyze(true)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {t("forceReanalyze")}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {t("analyzedAt", {
                          model: current.matchAnalysis.modelId,
                          time: new Date(current.matchAnalysis.analyzedAt).toLocaleString(),
                        })}
                      </span>
                    </>
                  )}

                  {staleAnalysis && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {staleAnalysis.reason === "content_changed"
                        ? t("staleContentChanged", {
                            count:
                              (staleAnalysis.changes?.added.length ?? 0) +
                              (staleAnalysis.changes?.modified.length ?? 0) +
                              (staleAnalysis.changes?.removed.length ?? 0),
                          })
                        : t("staleGeneric")}
                    </span>
                  )}

                  {!aiReady && (
                    <span className="text-xs text-muted-foreground">{t("needApiKey")}</span>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="font-medium text-destructive">{t("analyzeFailed")}</p>
                      <p className="mt-0.5 break-words text-muted-foreground">{error}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("fallbackHint")}</p>
                    </div>
                  </div>
                )}

                {current.matchAnalysis && (
                  <>
                    <FitLevelPanel analysis={current.matchAnalysis} />
                    <RequirementList
                      analysis={current.matchAnalysis}
                      entities={entities}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

interface EditorProps {
  target?: JobTarget;
  onCancel: () => void;
  onSubmit: (input: { company: string; position: string; jdRaw: string }) => void;
  onDelete?: () => void;
}

const TargetEditor = ({ target, onCancel, onSubmit, onDelete }: EditorProps) => {
  const t = useTranslations("targets");
  const [company, setCompany] = useState(target?.company ?? "");
  const [position, setPosition] = useState(target?.position ?? "");
  const [jdRaw, setJdRaw] = useState(target?.jdRaw ?? "");

  useEffect(() => {
    setCompany(target?.company ?? "");
    setPosition(target?.position ?? "");
    setJdRaw(target?.jdRaw ?? "");
  }, [target?.id]);

  // JD 质量检查：纯字符串匹配，不调用模型
  const warnings: string[] = [];
  if (jdRaw.trim() && jdRaw.trim().length < 100) warnings.push(t("warnShort"));
  if (jdRaw.trim() && !/要求|职责|负责|优先|任职/.test(jdRaw)) warnings.push(t("warnNoSection"));
  if (jdRaw.trim() && !/\d/.test(jdRaw)) warnings.push(t("warnNoNumbers"));

  const canSubmit = company.trim() !== "" && position.trim() !== "" && jdRaw.trim() !== "";

  return (
    <div className="space-y-4 rounded-xl border border-border/60 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("company")}</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("position")}</Label>
          <Input value={position} onChange={(e) => setPosition(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t("jdRaw")}</Label>
        <Textarea
          value={jdRaw}
          onChange={(e) => setJdRaw(e.target.value)}
          rows={10}
          placeholder={t("jdPlaceholder")}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">{t("jdNote")}</p>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
          {warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => onSubmit({ company: company.trim(), position: position.trim(), jdRaw: jdRaw.trim() })}
          disabled={!canSubmit}
        >
          {target ? t("save") : t("create")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        {onDelete && (
          <Button
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("delete")}
          </Button>
        )}
      </div>
    </div>
  );
};
