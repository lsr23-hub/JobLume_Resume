import { THRESHOLDS } from "./thresholds";
import type { AggregateMetrics } from "./metrics";
import { evaluateAll, type MetricVerdict } from "./thresholds";
import type { CaseMetrics, CaseRun, MetricKey } from "./types";

/**
 * 汇总成 Markdown。
 *
 * 报告的读者是**要做决定的人**，所以开头先给结论（哪几条没过），
 * 再给数字。堆一屏指标然后让人自己找问题，等于没写。
 */

export interface ReportInput {
  modelLabel: string;
  startedAt: string;
  dataset: { caseCount: number; profileCount: number; entityCount: number; dimensions: string[] };
  aggregate: AggregateMetrics;
  /** 每案例的首次运行，用于失败分析 */
  runs: Record<string, CaseRun>;
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const formatValue = (key: MetricKey, value: number): string => {
  // 漂移是「几条」，不是比例；相关系数量纲也不同，按原值展示
  if (key === "l1Drift") return String(value);
  return pct(value);
};

const renderVerdict = (v: MetricVerdict): string => {
  const t = THRESHOLDS[v.key];
  const compare = t.direction === "higher" ? "≥" : "≤";
  return `| ${v.label} | ${formatValue(v.key, v.value)} | ${compare} ${formatValue(v.key, v.threshold)} | ${v.pass ? "✅" : "❌"} |`;
};

export const buildReport = (input: ReportInput): string => {
  const { aggregate, runs } = input;
  const verdicts = evaluateAll(aggregate.values);
  const failed = verdicts.filter((v) => !v.pass);

  const lines: string[] = [];

  lines.push(`# 核心链路评测报告`);
  lines.push("");
  lines.push(`- **模型**：${input.modelLabel}`);
  lines.push(`- **时间**：${input.startedAt}`);
  lines.push(
    `- **数据集**：${input.dataset.caseCount} 个案例 / ${input.dataset.profileCount} 份档案 / ${input.dataset.entityCount} 条人工判定`
  );
  lines.push(`- **覆盖维度**：${input.dataset.dimensions.join("、")}`);
  lines.push("");

  // ── 结论先行 ──
  lines.push(`## 结论`);
  lines.push("");
  if (failed.length === 0) {
    lines.push(`**全部 ${verdicts.length} 项指标达标。**`);
  } else {
    lines.push(`**${verdicts.length} 项指标中 ${failed.length} 项未达标：**`);
    lines.push("");
    failed.forEach((v) => {
      const t = THRESHOLDS[v.key];
      lines.push(
        `- **${v.label}**：${formatValue(v.key, v.value)}（要求 ${t.direction === "higher" ? "≥" : "≤"} ${formatValue(v.key, v.threshold)}）—— ${t.rationale}`
      );
    });
  }
  lines.push("");

  // ── 指标表 ──
  const groups: Array<{ title: string; keys: MetricKey[] }> = [
    { title: "JD 理解", keys: ["missingRecall", "coverageFalsePositive"] },
    {
      title: "匹配判定",
      keys: [
        "falseNegativeRate",
        "falsePositiveRate",
        "evidenceSelfConsistency",
        "reasonHallucinationRate",
      ],
    },
    { title: "排序", keys: ["ndcgAt5", "spearman", "top5HitRate"] },
    { title: "筛选与成品", keys: ["mustHaveRecall", "idealJaccard", "selectionQuality"] },
    { title: "稳定性", keys: ["l1Drift", "rerunFlipRate", "rankKendallTau", "perturbationFlipRate"] },
  ];

  lines.push(`## 指标`);
  lines.push("");
  for (const group of groups) {
    const rows = verdicts.filter((v) => group.keys.includes(v.key));
    if (rows.length === 0) continue;
    lines.push(`### ${group.title}`);
    lines.push("");
    lines.push(`| 指标 | 实测 | 阈值 | |`);
    lines.push(`|---|---|---|---|`);
    rows.forEach((v) => lines.push(renderVerdict(v)));
    lines.push("");
  }

  const skipped = groups
    .flatMap((g) => g.keys)
    .filter((k) => aggregate.values[k] === undefined && !verdicts.some((v) => v.key === k));
  if (skipped.length > 0) {
    lines.push(`> 未采集：${skipped.map((k) => THRESHOLDS[k].label).join("、")}`);
    lines.push("");
  }

  // ── 分案例 ──
  lines.push(`## 分案例`);
  lines.push("");
  lines.push(`| 案例 | 判定漏判 | 误判 | NDCG@5 | 关键经历召回 | 理想重合 | 用时 |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const { caseId, metrics } of aggregate.perCase) {
    const run = runs[caseId];
    lines.push(
      `| ${caseId} | ${metrics.judgment.falseNegative} | ${metrics.judgment.falsePositive} | ${metrics.ranking.ndcgAt5.toFixed(2)} | ${metrics.selection.mustHaveRecall === 1 ? "✅" : "❌"} | ${metrics.selection.idealJaccard.toFixed(2)} | ${run ? `${(run.usage.elapsedMs / 1000).toFixed(1)}s` : "-"} |`
    );
  }
  lines.push("");

  // ── 失败案例：指标只说明「差」，这里说明「差在哪」 ──
  const hasFailures = aggregate.perCase.some(
    (c) =>
      c.metrics.judgment.falseNegatives.length > 0 ||
      c.metrics.selection.missed.length > 0 ||
      c.metrics.judgment.hallucinations.length > 0
  );

  if (hasFailures) {
    lines.push(`## 失败案例`);
    lines.push("");
    for (const { caseId, metrics } of aggregate.perCase) {
      const { falseNegatives, hallucinations } = metrics.judgment;
      const { missed } = metrics.selection;
      if (falseNegatives.length === 0 && missed.length === 0 && hallucinations.length === 0) continue;

      lines.push(`### ${caseId}`);
      lines.push("");

      if (falseNegatives.length > 0) {
        lines.push(`**漏判（人工认为该推荐，AI 判了不推荐）**`);
        lines.push("");
        falseNegatives.forEach((f) => {
          lines.push(`- ${f.title} —— 人工：${f.goldReason ?? "—"}｜AI：${f.aiReason || "（无理由）"}`);
        });
        lines.push("");
      }

      if (missed.length > 0) {
        lines.push(`**该进简历但没进**`);
        lines.push("");
        missed.forEach((m) => {
          lines.push(`- ${m.title}（相关度 ${m.relevance}${m.mustHave ? "，关键经历" : ""}）`);
        });
        lines.push("");
      }

      if (hallucinations.length > 0) {
        lines.push(`**理由里出现原文没有的事实**`);
        lines.push("");
        hallucinations.slice(0, 5).forEach((h) => {
          lines.push(`- ${h.title} —— 理由提到「${h.token}」，原文找不到`);
        });
        lines.push("");
      }
    }
  }

  // ── 成本 ──
  const allRuns = Object.values(runs);
  const totalCalls = allRuns.reduce((s, r) => s + (r.usage.calls ?? 0), 0);
  const totalMs = allRuns.reduce((s, r) => s + r.usage.elapsedMs, 0);
  const promptTokens = allRuns.reduce((s, r) => s + (r.usage.tokens?.promptTokens ?? 0), 0);
  const completionTokens = allRuns.reduce((s, r) => s + (r.usage.tokens?.completionTokens ?? 0), 0);

  lines.push(`## 成本`);
  lines.push("");
  lines.push(`| 项 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 模型调用次数 | ${totalCalls} |`);
  lines.push(`| 总耗时 | ${(totalMs / 1000).toFixed(1)}s |`);
  lines.push(`| 平均单次耗时 | ${totalCalls ? (totalMs / totalCalls / 1000).toFixed(1) : "-"}s |`);
  if (promptTokens || completionTokens) {
    lines.push(`| 输入 token | ${promptTokens} |`);
    lines.push(`| 输出 token | ${completionTokens} |`);
  } else {
    lines.push(`| token | 上游未返回用量，只有字符数：${allRuns.reduce((s, r) => s + r.usage.promptChars, 0)} 字符输入 / ${allRuns.reduce((s, r) => s + r.usage.outputChars, 0)} 字符输出 |`);
  }
  lines.push("");

  return lines.join("\n");
};

export type { CaseMetrics };
