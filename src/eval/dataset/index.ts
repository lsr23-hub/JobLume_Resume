import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { CareerProfile } from "@/types/profile";
import type { EvalCase, GoldStandard } from "../types";

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
  gold: Omit<GoldStandard, "entities"> & {
    entities: Record<string, GoldStandard["entities"][string]>;
  };
}

interface ProfileFile {
  refs: Record<string, string>;
  profile: CareerProfile;
}

export class DatasetError extends Error {}

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
    entities[id] = judgment;
  }

  const idealSelection = gold.idealSelection.map((ref) => {
    const id = refs[ref];
    if (!id) throw new DatasetError(`[${caseId}] idealSelection 引用了不存在的 ref：${ref}`);
    return id;
  });

  // 没标注的可见条目会让指标偏乐观 —— 模型判错也不会计入，必须在加载时拦住
  const visible = Object.values(profile.entities).filter((e) => !e.hidden);
  const unlabeled = visible.filter((e) => !entities[e.id]);
  if (unlabeled.length > 0) {
    const names = unlabeled
      .map((e) => Object.keys(refs).find((r) => refs[r] === e.id) ?? e.id)
      .join("、");
    throw new DatasetError(`[${caseId}] 这些条目还没标注：${names}`);
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
 * 判定的唯一排序信号是**相关度分级**。所以「理想集合」必须能由相关度还原出来：
 * 放进理想集合的条目，相关度不能低于没放进去的 —— 否则 AI 再怎么排都还原不了，
 * 指标会平白扣分，看起来像模型的错，其实是标注的问题。
 *
 * 分界线必须干净：入选的最低分要高于落选的最高分。同分跨边界时，
 * AI 在并列项里挑哪个都合理，指标却会扣分 —— 那是标注的问题。
 */
export interface LintIssue {
  caseId: string;
  message: string;
}

export const lintCases = (cases: EvalCase[]): LintIssue[] => {
  const issues: LintIssue[] = [];

  for (const c of cases) {
    const inIdeal = new Set(c.gold.idealSelection);
    const selected: Array<{ id: string; relevance: number }> = [];
    const excluded: Array<{ id: string; relevance: number }> = [];

    for (const [id, g] of Object.entries(c.gold.entities)) {
      (inIdeal.has(id) ? selected : excluded).push({ id, relevance: g.relevance });
    }

    // 分界线必须干净：入选的最低分要**高于**落选的最高分。
    // 同分跨边界时，AI 在并列项里挑哪个都合理，指标却会扣它的分 ——
    // 那是标注的问题，不是模型的问题。
    const minSelected = Math.min(...selected.map((s) => s.relevance));
    const offenders = excluded.filter((e) => e.relevance >= minSelected);

    if (offenders.length > 0) {
      issues.push({
        caseId: c.id,
        message:
          `理想集合最低相关度是 ${minSelected}，但集合外仍有同样相关或更高的：` +
          offenders.map((o) => `${o.id}(${o.relevance})`).join("、"),
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
