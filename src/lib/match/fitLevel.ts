import type { MatchAnalysis, Requirement } from "@/types/jobTarget";
import { requirementsOf } from "./validateMatchResult";

/**
 * 岗位级适配度等级 —— **由要求项推导，不由模型给**。
 *
 * 与 prompt v4 的决策一致：模型只排序，划线交给代码。这里的输入只有
 * `requirements[]`，**不读 `items` / `rankedIds` / `topN` / `recommendedCount`**
 * —— 那些是「这份简历放得下几条」的篇幅排序，与「够不够格投」是两件事。
 * 混用会把「模型排得靠前」误读成「条件匹配」。
 *
 * 不写进 `MatchAnalysis`：`requirementsOf()` 会为 v5 之前的旧数据从
 * `summary.coverage` 重建要求项，渲染时现算因此对旧数据自动生效，
 * 不必做 schema 迁移。缓存一个纯派生值只会多一个走样的来源。
 */

export type FitLevel = "strong" | "partial" | "gap" | "unknown";

/** 等级的理由类目。界面按它取 i18n 键，不自己从 counts 反推。 */
export type FitReason =
  | "no_analysis"
  | "no_requirements"
  | "must_missing"
  | "must_thin"
  | "nice_missing"
  | "backed";

export interface FitLevelResult {
  level: FitLevel;
  reason: FitReason;
  /** 由 `summary.coverage` 反推出来的旧分析 —— 它没有经历指向，因此够不到 strong */
  legacy: boolean;
  counts: {
    mustBacked: number;
    mustThin: number;
    mustMissing: number;
    niceMissing: number;
    total: number;
  };
}

/**
 * 「有支撑」= 判为 covered **且指得出是哪条经历**。
 *
 * 那个 `entityIds.length > 0` 不是防御性冗余：
 * - 校验阶段会把「声称 covered 却指不出经历」降级为 weak（`normalizeRequirements`），
 *   所以新数据天然满足；
 * - 但 **`legacyRequirements` 反推出来的旧数据会给出 `status: "covered"` 且
 *   `entityIds: []`** —— 旧分析在界面上本来就会显示「✓ 已覆盖」而没有任何依据。
 *   不加这个判断，旧数据能一路够到「匹配度高」，等于凭一句无从核对的话给用户打包票。
 */
const isBacked = (r: Requirement): boolean =>
  r.status === "covered" && r.entityIds.length > 0;

export const fitLevelOf = (
  analysis: MatchAnalysis | null | undefined
): FitLevelResult => {
  const legacy = Boolean(analysis) && !Array.isArray(analysis?.requirements);

  const empty = (level: FitLevel, reason: FitReason): FitLevelResult => ({
    level,
    reason,
    legacy,
    counts: { mustBacked: 0, mustThin: 0, mustMissing: 0, niceMissing: 0, total: 0 },
  });

  if (!analysis) return empty("unknown", "no_analysis");

  const requirements = requirementsOf(analysis);
  // 职责（duty）不参与 —— 「没做过 JD 里写的某段职责」不是缺陷，是换工作的常态。
  // 与 deriveCoverage 的处理一致。
  const judged = requirements.filter((r) => r.kind !== "duty");
  if (judged.length === 0) return empty("unknown", "no_requirements");

  const musts = judged.filter((r) => r.kind === "must");
  const nices = judged.filter((r) => r.kind === "nice");

  const counts = {
    mustBacked: musts.filter(isBacked).length,
    mustThin: musts.filter((r) => !isBacked(r) && r.status !== "missing").length,
    mustMissing: musts.filter((r) => r.status === "missing").length,
    niceMissing: nices.filter((r) => r.status === "missing").length,
    total: judged.length,
  };

  // 只有加分项、没有硬性要求时，硬性维度无从判定 —— 退回「无法判定」而不是给高分
  if (musts.length === 0) {
    return {
      level: counts.niceMissing > 0 ? "partial" : "strong",
      reason: counts.niceMissing > 0 ? "nice_missing" : "backed",
      legacy,
      counts,
    };
  }

  if (counts.mustMissing > 0) return { level: "gap", reason: "must_missing", legacy, counts };
  if (counts.mustThin > 0) return { level: "partial", reason: "must_thin", legacy, counts };
  if (counts.niceMissing > 0)
    return { level: "partial", reason: "nice_missing", legacy, counts };
  return { level: "strong", reason: "backed", legacy, counts };
};
