import { analyzeMatch } from "@/lib/match/analyzeMatch";
import type { AnalysisCache, MatchAnalysis } from "@/types/jobTarget";
import type { CareerProfile } from "@/types/profile";
import { computeCoverageMetrics } from "./metrics/coverage";
import { computeRequirementMetrics } from "./metrics/requirements";
import { computeJudgmentMetrics } from "./metrics/judgment";
import { computeRankingMetrics } from "./metrics/ranking";
import { computeSelectionMetrics } from "./metrics/selection";
import { installMatchFetchBridge, type Transport } from "./provider";
import type { CaseMetrics, CaseRun, EvalCase } from "./types";

/**
 * 跑一个案例。
 *
 * 走的是**生产的 `analyzeMatch`**（经 fetch 桥接到 transport），
 * 所以缓存判定、prompt 构造、结果校验全都是真实路径。
 */

export interface RunCaseOptions {
  /** 除首次外再跑几次，用于稳定性指标 */
  reruns?: number;
  /** 是否额外验证一次「缓存命中」路径 */
  checkCache?: boolean;
  now?: string;
}

export interface CaseRunResult {
  caseId: string;
  /** 首次 + 重跑 */
  runs: CaseRun[];
  /** 缓存命中那次（若启用），用于 L1 检查 */
  cachedRun: CaseRun | null;
}

const EMPTY_ANALYSIS: MatchAnalysis | null = null;

interface Executed {
  run: CaseRun;
  /** 本次运行产出的缓存，供 L1 检查原样喂回去 */
  cache: AnalysisCache | null;
}

const executeOnce = async (
  evalCase: EvalCase,
  transport: Transport,
  options: { force: boolean; cache: AnalysisCache | null; cached: MatchAnalysis | null; now: string }
): Promise<Executed> => {
  const entities = Object.values(evalCase.profile?.entities ?? {});
  const bridge = installMatchFetchBridge(transport);

  try {
    const outcome = await analyzeMatch({
      target: evalCase.jd,
      entities,
      config: { apiKey: "eval", model: transport.modelId, modelType: transport.modelType as never },
      now: options.now,
      cache: options.cache,
      cachedAnalysis: options.cached,
      force: options.force,
    });

    // 缓存命中时 calls 为空 —— 这正是 L1 要验证的：根本没发请求
    const call = bridge.calls[bridge.calls.length - 1];
    const usage = {
      promptChars: bridge.calls.reduce((s, c) => s + c.promptChars, 0),
      outputChars: bridge.calls.reduce((s, c) => s + c.outputChars, 0),
      elapsedMs: bridge.calls.reduce((s, c) => s + c.elapsedMs, 0),
      calls: bridge.calls.length,
      tokens: call?.usage,
    };

    if (!outcome.ok) {
      return {
        run: {
          caseId: evalCase.id,
          modelType: transport.modelType,
          modelId: transport.modelId,
          fromCache: false,
          raw: call?.raw ?? "",
          analysis: EMPTY_ANALYSIS,
          corrections: [],
          usage,
          error: outcome.error,
        },
        cache: null,
      };
    }

    return {
      run: {
        caseId: evalCase.id,
        modelType: transport.modelType,
        modelId: transport.modelId,
        fromCache: outcome.fromCache,
        raw: call?.raw ?? "",
        analysis: outcome.analysis,
        corrections: outcome.corrections,
        usage,
      },
      cache: outcome.cache,
    };
  } finally {
    bridge.restore();
  }
};

export const runCase = async (
  evalCase: EvalCase,
  transport: Transport,
  options: RunCaseOptions = {}
): Promise<CaseRunResult> => {
  const { reruns = 0, checkCache = false } = options;
  const now = options.now ?? new Date().toISOString();

  const runs: CaseRun[] = [];

  // 首次：不带缓存，拿它当作基准
  const first = await executeOnce(evalCase, transport, {
    force: false,
    cache: null,
    cached: null,
    now,
  });
  runs.push(first.run);

  // L1：把首次产出的缓存与结果**原样**喂回去。
  // 必须用真实缓存 —— 手搓一个桩（比如 promptVersion 填空）会让 checkCache
  // 判定「prompt 变了」而不复用，于是又发一次真实请求：那样测的是
  // 「两次独立调用是否一致」（那是 L2），而不是「缓存命中是否零漂移」。
  let cachedRun: CaseRun | null = null;
  if (checkCache && first.cache && first.run.analysis) {
    const cached = await executeOnce(evalCase, transport, {
      force: false,
      cache: first.cache,
      cached: first.run.analysis,
      now,
    });
    cachedRun = cached.run;
  }

  // 重跑：force 掉缓存
  for (let i = 0; i < reruns; i += 1) {
    const again = await executeOnce(evalCase, transport, {
      force: true,
      cache: null,
      cached: null,
      now,
    });
    runs.push(again.run);
  }

  return { caseId: evalCase.id, runs, cachedRun };
};

/** 从首次运行算出这个案例的全部指标 */
export const metricsFor = (evalCase: EvalCase, run: CaseRun): CaseMetrics => {
  const entities = Object.values(evalCase.profile?.entities ?? {});
  const titles = Object.fromEntries(entities.map((e) => [e.id, e.title]));
  const gold = evalCase.gold;

  return {
    caseId: evalCase.id,
    dimensions: evalCase.dimensions,
    judgment: computeJudgmentMetrics(run.analysis, gold.entities, entities, evalCase.jd.jdRaw),
    coverage: computeCoverageMetrics(
      run.analysis,
      gold.missingSkills,
      gold.unsupportedSkills ?? []
    ),
    requirements: computeRequirementMetrics(run.analysis, gold.requirements),
    ranking: computeRankingMetrics(run.analysis, gold.entities, titles),
    selection: computeSelectionMetrics(run.analysis, gold.entities, gold.idealSelection, titles),
  };
};

export type { CareerProfile };
