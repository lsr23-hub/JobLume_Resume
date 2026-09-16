import type { ProfileEntity } from "@/types/profile";

/** 时效性曲线参数 */
export const RECENCY_CURVE = {
  /** 此年数内满分 */
  fullScoreYears: 3,
  /** 衰减到此年数触底 */
  floorYears: 8,
  /** 触底分数 */
  floorScore: 0.2,
} as const;

/**
 * 同类经历衰减系数 —— 唯一凭经验设定的参数。
 *
 * 含义：同类的第二条经历需要「新一倍」才能压过别类的经历。
 * 语义单一、凭直觉可判断，不需要一套解释不清的加权公式。
 */
export const SAME_CATEGORY_DECAY = 0.5;

/** 无法解析时间时的中性分 —— 不用 0，避免把「未标注」误判成「不相关」 */
const NEUTRAL_SCORE = 0.5;

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/** 时效分：进行中满分；N 年内满分；之后线性衰减到触底分 */
export const recencyScore = (entity: ProfileEntity, now: number): number => {
  if (entity.isCurrent) return 1;
  if (entity.endTimestamp === undefined) return NEUTRAL_SCORE;

  const years = (now - entity.endTimestamp) / MS_PER_YEAR;
  if (years <= RECENCY_CURVE.fullScoreYears) return 1;
  if (years >= RECENCY_CURVE.floorYears) return RECENCY_CURVE.floorScore;

  const span = RECENCY_CURVE.floorYears - RECENCY_CURVE.fullScoreYears;
  const decayed = 1 - ((1 - RECENCY_CURVE.floorScore) * (years - RECENCY_CURVE.fullScoreYears)) / span;
  return decayed;
};

export interface RankedEntity {
  entity: ProfileEntity;
  score: number;
  /** 该条目是同类中的第几条（从 1 开始）。1 表示未被衰减 */
  sameCategoryRank: number;
}

/**
 * 通用简历的排序：时效 × 同类衰减。
 *
 * 为什么不是纯时效：如果近期经历集中在同一领域，纯时效会让「什么岗位都能投」
 * 的通用简历变成一份领域专用简历。同类衰减确保不同类型的经历都能进入前列。
 *
 * 类别取自 `tags[0]`，未打标签的条目不参与衰减。
 *
 * 结果与输入顺序无关 —— 先按「基础分降序 + id 升序」把先后定死，再施加衰减，
 * 因此可复现。
 */
export const rankGeneric = (entities: ProfileEntity[], now: number): RankedEntity[] => {
  const active = entities.filter((e) => !e.hidden);

  const scored = active
    .map((entity) => ({
      entity,
      base: recencyScore(entity, now),
      category: entity.tags[0] || null,
    }))
    .sort((a, b) => b.base - a.base || a.entity.id.localeCompare(b.entity.id));

  const seenPerCategory = new Map<string, number>();

  return scored
    .map((s) => {
      const prior = s.category ? (seenPerCategory.get(s.category) ?? 0) : 0;
      if (s.category) seenPerCategory.set(s.category, prior + 1);

      return {
        entity: s.entity,
        score: s.base * Math.pow(SAME_CATEGORY_DECAY, prior),
        sameCategoryRank: prior + 1,
      };
    })
    .sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id));
};
