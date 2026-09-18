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
  /** 执行失败的案例 —— 必须显示，否则它们会静默从指标里消失，结果虚高 */
  failures: Array<{ caseId: string; error: string }>;
  totalCases: number;
  dataset: { caseCount: number; profileCount: number; entityCount: number; dimensions: string[] };
  aggregate: AggregateMetrics;
  /** 每案例的首次运行，用于失败分析 */
  runs: Record<string, CaseRun>;
  /**
   * 每案例的**全部**运行的指标。
   *
   * 覆盖度那一项必须看全部运行：模型每次报的缺口不完全一样，
   * 只拿首次运行讲「漏了哪条」，会把一个三次里漏两次的缺口说成没漏。
   * 缺省时退化为只看首次运行。
   */
  perRun?: Record<string, CaseMetrics[]>;
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
  lines.push(
    `- **案例执行**：${input.totalCases - input.failures.length} / ${input.totalCases} 成功` +
      (input.failures.length > 0 ? ` —— **未成功的案例不计入下面的指标**` : "")
  );
  lines.push("");

  // ── 失败的案例先说，否则读者会以为指标覆盖了全部案例 ──
  if (input.failures.length > 0) {
    lines.push(`## 执行失败`);
    lines.push("");
    input.failures.forEach((f) => lines.push(`- **${f.caseId}**：${f.error}`));
    lines.push("");
  }

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
    { title: "判定质量", keys: ["reasonHallucinationRate"] },
    { title: "排序", keys: ["ndcgAt5", "spearman", "top5HitRate"] },
    { title: "筛选与成品", keys: ["mustHaveRecall", "idealJaccard", "selectionQuality"] },
    { title: "稳定性", keys: ["l1Drift", "rankKendallTau", "perturbationFlipRate"] },
  ];

  lines.push(`## 指标`);
  lines.push("");
  lines.push(
    "> 判定类的混淆矩阵（漏判率 / 误判率 / 证据自洽率）**不在本表内**。" +
      "模型自 prompt v4 起只输出优先级排序，不再输出「推荐 / 不推荐」这个二分标签 ——" +
      "该在哪划线取决于用户这份简历放得下几条，模型无从知道。" +
      "同一件事由下面的排序与筛选指标承担。"
  );
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

  // 覆盖度这两项的标注量必须和比率一起看 —— 全数据集只有十来条标注，
  // 一条就能让分案例的比率动几十个百分点，单看比率是过度解读
  const missingTotal = aggregate.perCase.reduce((s, c) => s + c.metrics.coverage.missingTotal, 0);
  const unsupportedTotal = aggregate.perCase.reduce(
    (s, c) => s + c.metrics.coverage.unsupportedTotal,
    0
  );
  lines.push(
    `> JD 理解那一组的两个数**由要求项派生**（prompt v5 起）：模型逐条抽取 JD 要求，` +
      `每条带 covered / weak / missing 与指向的经历，代码再按 status 把它的 keys 归成` +
      `三组。所以「缺失」指的是**判成 missing 的要求**，不是模型随手报的缺口清单 ——` +
      `与 v4 时代的口径不同，两版之间的数字不可直接比较。`
  );
  lines.push("");
  lines.push(
    `> JD 理解那一组的标注量很薄：全数据集 ${missingTotal} 条「档案无支撑」标注、` +
      `${unsupportedTotal} 条「虚报覆盖」标注。一条就能让某个案例的比率动 25 个百分点以上 ——` +
      `这两种数当旗标看，别当测量值。`
  );
  lines.push("");
  lines.push(
    `> 占比类的数字都按**案例平均**（判定类的混淆矩阵除外，那个按原始计数合并）。` +
      `所以没有标注的案例在覆盖虚报率里计 0 分，等于白拿一个满分 ——` +
      `这是已知的稀释问题，本轮没有改：看数据之后改口径，改出来的结论不可信。`
  );
  lines.push("");

  // 缓存没命中时 l1Drift 测的是模型抖动而非缓存 —— 必须说清楚，
  // 否则会把缓存故障误读成「模型不稳定」
  if (aggregate.stability?.l1Checked && !aggregate.stability.l1FromCache) {
    lines.push(
      `> ⚠️ L1 那一次**没有命中缓存**（仍然发出了真实请求）。此时「缓存漂移为 0」` +
        `说明的是模型两次结果一致，而不是缓存生效 —— 缓存本身可能已经坏了。`
    );
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
  lines.push(`| 案例 | NDCG@5 | 斯皮尔曼 | 关键经历召回 | 理想重合 | 选择质量 | 缺失项召回 | 覆盖虚报 | 用时 |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const { caseId, metrics } of aggregate.perCase) {
    const run = runs[caseId];
    const cov = metrics.coverage;
    lines.push(
      `| ${caseId} | ${metrics.ranking.ndcgAt5.toFixed(2)} | ${metrics.ranking.spearman.toFixed(2)} | ${metrics.selection.mustHaveRecall === 1 ? "✅" : "❌"} | ${metrics.selection.idealJaccard.toFixed(2)} | ${metrics.selection.selectionQuality.toFixed(2)} | ${cov.missingTotal === 0 ? "—" : pct(cov.missingRecall)} | ${cov.unsupportedTotal === 0 ? "—" : pct(cov.coverageFalsePositive)} | ${run ? `${(run.usage.elapsedMs / 1000).toFixed(1)}s` : "-"} |`
    );
  }
  lines.push("");

  // ── 失败案例：指标只说明「差」，这里说明「差在哪」 ──
  const hasCoverageMiss = (caseId: string): boolean => {
    const runsOfCase = input.perRun?.[caseId];
    if (!runsOfCase) return false;
    return runsOfCase.some(
      (m) => m.coverage.missingMissed.length > 0 || m.coverage.unsupportedClaimed.length > 0
    );
  };

  const hasFailures = aggregate.perCase.some(
    (c) =>
      c.metrics.judgment.falseNegatives.length > 0 ||
      c.metrics.selection.missed.length > 0 ||
      c.metrics.judgment.hallucinations.length > 0 ||
      hasCoverageMiss(c.caseId)
  );

  if (hasFailures) {
    lines.push(`## 失败案例`);
    lines.push("");
    lines.push(
      `> 判定与排序的明细取自**首次运行**；覆盖度那一块的命中次数是**跨全部运行**统计的。`
    );
    lines.push("");
    for (const { caseId, metrics } of aggregate.perCase) {
      const { falseNegatives, falsePositives, hallucinations } = metrics.judgment;
      const { missed } = metrics.selection;
      const coverageMiss = hasCoverageMiss(caseId);
      if (
        falseNegatives.length === 0 &&
        falsePositives.length === 0 &&
        missed.length === 0 &&
        hallucinations.length === 0 &&
        !coverageMiss
      )
        continue;

      lines.push(`### ${caseId}`);
      lines.push("");
      const topN = input.runs[caseId]?.analysis?.topN ?? 5;

      if (coverageMiss) {
        const runsOfCase = input.perRun?.[caseId] ?? [];
        // 人工标注过的缺口 = 任意一次运行里出现过「命中」或「漏掉」的那些
        const goldItems = Array.from(
          new Set(
            runsOfCase.flatMap((m) => [...m.coverage.missingFound, ...m.coverage.missingMissed])
          )
        );
        const hitsOf = (item: string): number =>
          runsOfCase.filter((m) => m.coverage.missingFound.includes(item)).length;

        lines.push(
          `**覆盖判断（人工标注了 ${goldItems.length} 条「JD 要求、档案没支撑」，模型三次运行各报各的）**`
        );
        lines.push("");
        goldItems.forEach((item) => {
          const hits = hitsOf(item);
          const mark = hits === runsOfCase.length ? "✅" : hits === 0 ? "❌" : "⚠️";
          lines.push(
            `- ${mark} ${item} —— ${runsOfCase.length} 次运行里报出 ${hits} 次`
          );
        });
        const claimed = Array.from(
          new Set(runsOfCase.flatMap((m) => m.coverage.unsupportedClaimed))
        );
        if (claimed.length > 0) {
          lines.push("");
          lines.push(
            `**虚报覆盖（人工认为档案不支持，模型列进了 covered）**：${claimed.join("、")}`
          );
        }
        // 模型每次实际报出的缺口 —— 读者可以自己看它报的是不是同一件事
        const reported = Array.from(
          new Set(
            input.runs[caseId]?.analysis?.summary.coverage.missing ?? []
          )
        );
        if (reported.length > 0) {
          lines.push("");
          lines.push(`模型首次运行报出的缺口：${reported.join("、")}`);
        }
        lines.push("");
      }

      if (falseNegatives.length > 0) {
        // v4 起模型只排序，不判「推荐 / 不推荐」—— 所以这里说的是名次，
        // 不是模型的判定。沿用旧措辞会让人以为模型做了一次它没做的判断
        lines.push(`**排序偏低（人工标为推荐，AI 排在前 ${topN} 名之外）**`);
        lines.push("");
        falseNegatives.forEach((f) => {
          lines.push(`- ${f.title} —— 人工：${f.goldReason ?? "—"}｜AI：${f.aiReason || "（无理由）"}`);
        });
        lines.push("");
      }

      if (falsePositives.length > 0) {
        lines.push(`**排序偏高（人工标为不相关，AI 排进了前 ${topN} 名）**`);
        lines.push("");
        falsePositives.forEach((f) => {
          lines.push(`- ${f.title} —— AI：${f.aiReason || "（无理由）"}`);
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
