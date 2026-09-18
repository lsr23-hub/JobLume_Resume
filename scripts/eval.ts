/**
 * 核心链路评测 CLI。
 *
 *   pnpm eval --transport mock --mock-mode oracle        # 冒烟：不花钱，验证框架
 *   pnpm eval --transport real --provider deepseek       # 真实跑批
 *
 * API key 从环境变量读，不接受命令行传参 —— 别让它进 shell history。
 *   DEEPSEEK_API_KEY / DOUBAO_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AIModelType } from "../src/config/ai";
import { loadAllCases, summarizeDataset } from "../src/eval/dataset";
import { computeStabilityMetrics } from "../src/eval/metrics/stability";
import { aggregateMetrics } from "../src/eval/metrics";
import { createMockTransport, realTransport, type MockMode, type Transport } from "../src/eval/provider";
import { buildReport } from "../src/eval/report";
import { metricsFor, runCase } from "../src/eval/runner";
import type { CaseMetrics, CaseRun } from "../src/eval/types";

interface Args {
  transport: "mock" | "real";
  mockMode: MockMode;
  provider: AIModelType;
  model: string;
  apiEndpoint?: string;
  cases: string[];
  runs: number;
  cacheCheck: boolean;
  out?: string;
}

const parseArgs = (argv: string[]): Args => {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const provider = (get("--provider") ?? "deepseek") as AIModelType;
  const defaultModel: Record<string, string> = {
    deepseek: "deepseek-chat",
    doubao: "",
    openai: "",
    gemini: "gemini-flash-latest",
  };

  return {
    transport: (get("--transport") ?? "mock") as Args["transport"],
    mockMode: (get("--mock-mode") ?? "oracle") as MockMode,
    provider,
    model: get("--model") ?? defaultModel[provider] ?? "",
    apiEndpoint: get("--endpoint"),
    cases: (get("--cases") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    runs: Number(get("--runs") ?? 1),
    cacheCheck: argv.includes("--cache-check"),
    out: get("--out"),
  };
};

const apiKeyFor = (provider: AIModelType): string => {
  const key =
    process.env.EVAL_API_KEY ??
    process.env[`${provider.toUpperCase()}_API_KEY`] ??
    "";
  if (!key) {
    throw new Error(
      `缺少 API key。请设置 ${provider.toUpperCase()}_API_KEY 或 EVAL_API_KEY 环境变量。`
    );
  }
  return key;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadAllCases(args.cases);
  const dataset = summarizeDataset(cases);
  const startedAt = new Date().toISOString();

  const stamp = startedAt.replace(/[:.]/g, "-").slice(0, 19);
  const outDir = args.out ?? join(process.cwd(), "eval-results", stamp);
  mkdirSync(join(outDir, "raw"), { recursive: true });

  const transportFor = (caseId: string): Transport => {
    if (args.transport === "mock") {
      const evalCase = cases.find((c) => c.id === caseId);
      if (!evalCase) throw new Error(`找不到案例 ${caseId}`);
      return createMockTransport(evalCase, args.mockMode);
    }
    return realTransport({
      modelType: args.provider,
      modelId: args.model,
      apiKey: apiKeyFor(args.provider),
      apiEndpoint: args.apiEndpoint,
    });
  };

  const label = args.transport === "mock" ? `mock/${args.mockMode}` : `${args.provider}/${args.model}`;
  console.log(`评测开始：${cases.length} 个案例，传输层 ${label}，重跑 ${args.runs} 次`);

  const caseMetrics: CaseMetrics[] = [];
  const firstRuns: Record<string, CaseRun> = {};
  const stabilityInputs: Parameters<typeof computeStabilityMetrics>[0] = {
    runs: [],
    cachedRun: null,
    perturbedRun: null,
  };
  // 稳定性按案例平均，这里先把每个案例的指标收集起来
  const perCaseStability: Array<ReturnType<typeof computeStabilityMetrics>> = [];

  for (const evalCase of cases) {
    process.stdout.write(`  ${evalCase.id} … `);
    const result = await runCase(evalCase, transportFor(evalCase.id), {
      reruns: args.runs - 1,
      checkCache: args.cacheCheck,
    });

    const first = result.runs[0];
    firstRuns[evalCase.id] = first;

    if (first.error) {
      console.log(`失败：${first.error}`);
    } else {
      const m = metricsFor(evalCase, first);
      caseMetrics.push(m);
      console.log(
        `完成（漏判 ${m.judgment.falseNegative}，误判 ${m.judgment.falsePositive}，NDCG@5 ${m.ranking.ndcgAt5.toFixed(2)}，${(first.usage.elapsedMs / 1000).toFixed(1)}s）`
      );
    }

    perCaseStability.push(
      computeStabilityMetrics({ runs: result.runs, cachedRun: result.cachedRun })
    );

    writeFileSync(
      join(outDir, "raw", `${evalCase.id}.json`),
      JSON.stringify(
        {
          case: { id: evalCase.id, jd: evalCase.jd },
          runs: result.runs,
          // L1 那次单独放 —— 它的 calls 应当是 0，这是「缓存真的生效」的证据
          cachedRun: result.cachedRun,
        },
        null,
        1
      )
    );
  }

  // 稳定性指标跨案例取平均
  const stability = computeStabilityMetrics(stabilityInputs);
  const avg = (pick: (s: (typeof perCaseStability)[number]) => number): number =>
    perCaseStability.length === 0
      ? 1
      : perCaseStability.reduce((s, x) => s + pick(x), 0) / perCaseStability.length;

  stability.l1Drift = perCaseStability.reduce((s, x) => s + x.l1Drift, 0);
  stability.l1Checked = perCaseStability.some((x) => x.l1Checked);
  // 所有案例都该命中缓存；有一个没命中就说明缓存判定失效，报告要能看出来
  stability.l1FromCache = perCaseStability.every((x) => x.l1FromCache);
  stability.rerunFlipRate = avg((x) => x.rerunFlipRate);
  stability.rankKendallTau = avg((x) => x.rankKendallTau);
  stability.perturbationChecked = perCaseStability.some((x) => x.perturbationChecked);
  stability.runCount = args.runs;

  const aggregate = aggregateMetrics(caseMetrics, stability);

  const report = buildReport({
    modelLabel: label,
    startedAt,
    dataset,
    aggregate,
    runs: firstRuns,
  });

  writeFileSync(join(outDir, "report.md"), report);
  console.log(`\n报告：${join(outDir, "report.md")}`);
  console.log(`原始输出：${join(outDir, "raw")}/`);
};

main().catch((error) => {
  console.error(`评测失败：${(error as Error).message}`);
  process.exit(1);
});
