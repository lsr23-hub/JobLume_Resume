import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { CareerProfile } from "@/types/profile";
import { RECOMMEND_THRESHOLD, type EvalCase, type GoldStandard, type RawGoldEntity } from "../types";

/**
 * 数据集加载与校验。
 *
 * 案例文件里用**可读的 ref**（如 `exp-华泰证券`）引用条目，不写 UUID ——
 * 标注时对着 id 看没人受得了。加载时再把 ref 解析成 entityId。
 *
 * 加载即校验：ref 解析不出来、有经历没被标注，都直接抛错。
 * 数据集有洞的话，指标算出来是假的，还不如跑不起来。
 */

const DATASET_DIR = join(process.cwd(), "src/eval/dataset");

/** 案例文件里的原始结构（gold 用 ref 而不是 id） */
interface RawCase {
  id: string;
  note?: string;
  dimensions: string[];
  profileFile: string;
  jd: EvalCase["jd"];
  gold: Omit<GoldStandard, "entities" | "idealSelection" | "budget"> & {
    entities: Record<string, RawGoldEntity>;
    /** 一页能放几条 */
    budget: number;
  };
}

interface ProfileFile {
  refs: Record<string, string>;
  profile: CareerProfile;
}

export class DatasetError extends Error {}

/** id → ref 的反查，只用于排序时取稳定的名字 */
const refsOf = (refs: Record<string, string>, id: string): string | undefined =>
  Object.keys(refs).find((r) => refs[r] === id);

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export const loadProfile = (file: string): ProfileFile => {
  try {
    return readJson<ProfileFile>(join(DATASET_DIR, "profiles", file));
  } catch (error) {
    throw new DatasetError(`档案读不出来：${file}（${(error as Error).message}）`);
  }
};

const resolveRefs = (
  caseId: string,
  refs: Record<string, string>,
  gold: RawCase["gold"],
  profile: CareerProfile
): GoldStandard => {
  const entities: GoldStandard["entities"] = {};

  for (const [ref, judgment] of Object.entries(gold.entities)) {
    const id = refs[ref];
    if (!id) throw new DatasetError(`[${caseId}] 标注引用了不存在的 ref：${ref}`);
    if (!profile.entities[id]) {
      throw new DatasetError(`[${caseId}] ref ${ref} 指向的条目已不在档案里`);
    }
    if (entities[id]) {
      throw new DatasetError(`[${caseId}] 两个 ref 指向同一条目：${ref}`);
    }
    entities[id] = {
      ...judgment,
      level: judgment.relevance >= RECOMMEND_THRESHOLD ? "recommended" : "not_recommended",
    };
  }

  // 理想集合由相关度派生：降序取前 budget 条，同分按 id 稳定排序
  const idealSelection = Object.keys(entities)
    .sort(
      (a, b) =>
        entities[b].relevance - entities[a].relevance ||
        (refsOf(refs, a) ?? a).localeCompare(refsOf(refs, b) ?? b)
    )
    .slice(0, gold.budget);

  // 没标注的可见条目会让指标偏乐观 —— 模型判错也不会计入，必须在加载时拦住
  const visible = Object.values(profile.entities).filter((e) => !e.hidden);
  const unlabeled = visible.filter((e) => !entities[e.id]);
  if (unlabeled.length > 0) {
    const names = unlabeled
      .map((e) => Object.keys(refs).find((r) => refs[r] === e.id) ?? e.id)
      .join("、");
    throw new DatasetError(`[${caseId}] 这些条目还没标注：${names}`);
  }

  const belowThreshold = idealSelection.filter(
    (id) => entities[id].relevance < RECOMMEND_THRESHOLD
  );
  if (belowThreshold.length > 0) {
    throw new DatasetError(
      `[${caseId}] 预算 ${gold.budget} 条超过了相关度 ≥ ${RECOMMEND_THRESHOLD} 的条目数，` +
        `理想集合会混进不相关的条目。要么调低预算，要么把相关度标对。`
    );
  }

  return { ...gold, entities, idealSelection };
};

export const loadCase = (file: string): EvalCase => {
  const raw = readJson<RawCase>(join(DATASET_DIR, "cases", file));
  const { refs, profile } = loadProfile(raw.profileFile);

  return {
    id: raw.id,
    note: raw.note,
    dimensions: raw.dimensions,
    profileFile: raw.profileFile,
    jd: raw.jd,
    gold: resolveRefs(raw.id, refs, raw.gold, profile),
    profile,
  };
};

export const listCaseFiles = (): string[] =>
  readdirSync(join(DATASET_DIR, "cases"))
    .filter((f) => f.endsWith(".json"))
    .sort();

export const loadAllCases = (filter?: string[]): EvalCase[] => {
  const files = listCaseFiles();
  const cases = files.map(loadCase);
  if (!filter || filter.length === 0) return cases;

  const wanted = cases.filter((c) => filter.includes(c.id));
  const missing = filter.filter((id) => !cases.some((c) => c.id === id));
  if (missing.length > 0) {
    throw new DatasetError(`找不到这些案例：${missing.join("、")}`);
  }
  return wanted;
};

/**
 * 数据集自洽性检查。
 *
 * `level` 与 `idealSelection` 已由相关度派生，不会再互相矛盾
 * （那是上一版的问题：集合内有相关度 1、集合外有相关度 2）。
 * 剩下的风险只有一个：**理想集合的边界上有并列**。
 *
 * 并列跨在预算线上时，AI 在并列项里挑哪个都合理，指标却会扣它的分 ——
 * 那是标注不够利落，不是模型的问题。
 */
export interface LintIssue {
  caseId: string;
  message: string;
}

export const lintCases = (cases: EvalCase[]): LintIssue[] => {
  const issues: LintIssue[] = [];

  for (const c of cases) {
    const ranked = Object.entries(c.gold.entities).sort(
      (a, b) => b[1].relevance - a[1].relevance
    );

    const lastIn = ranked[c.gold.budget - 1];
    const firstOut = ranked[c.gold.budget];

    if (lastIn && firstOut && lastIn[1].relevance === firstOut[1].relevance) {
      issues.push({
        caseId: c.id,
        message:
          `预算线（第 ${c.gold.budget} 条）上有并列：` +
          `${lastIn[0]} 与 ${firstOut[0]} 都是相关度 ${lastIn[1].relevance}，` +
          `AI 挑哪个都合理，指标却会扣分。调相关度或调预算，把线划在干净的地方。`,
      });
    }
  }

  return issues;
};

/** 数据集概览，报告开头用 */
export const summarizeDataset = (cases: EvalCase[]) => {
  const dimensions = new Set<string>();
  cases.forEach((c) => c.dimensions.forEach((d) => dimensions.add(d)));

  const profiles = new Set(cases.map((c) => c.profileFile));

  return {
    caseCount: cases.length,
    profileCount: profiles.size,
    entityCount: cases.reduce((s, c) => s + Object.keys(c.gold.entities).length, 0),
    dimensions: Array.from(dimensions),
  };
};
