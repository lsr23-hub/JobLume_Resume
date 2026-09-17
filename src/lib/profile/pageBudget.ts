import type { ProfileEntity } from "@/types/profile";
import { A4_HEIGHT_PX, computeAutoOnePage } from "@/hooks/useAutoOnePage";
import { SECTION_IDS } from "@/config/sections";

/**
 * 页数预算：把「一页为最佳，尽量不超过两页」变成可计算的东西。
 *
 * 三步，从便宜到贵（见 `docs/03-generation-algorithm.md` §2.3）：
 *
 * 1. 缩放字号与间距（`computeAutoOnePage`，下限 0.9）—— 不改内容，自动执行
 * 2. 按优先级从尾部移除条目，直到刚好装进目标页数 —— **只提议，用户点了才生效**
 * 3. 一页需要砍掉一半以上 → 改按两页给建议
 *
 * 本模块是纯计算：渲染与测量由调用方以 `measure` 回调注入，
 * 这样整个取舍过程可以用一个假的 measure 函数在单测里跑完。
 */

/** A4 宽度，单位 mm —— 离屏测量与预览都按这个宽度排版 */
export const A4_WIDTH_MM = 210;

export interface PageState {
  /** 页数，至少 1 */
  pages: number;
  /** 预览会用的缩放倍率 */
  scaleFactor: number;
  /** 缩到下限仍装不进一页 */
  cannotFit: boolean;
}

/** 一页能装的内容高度（未缩放时） */
export const contentPerPage = (pagePadding: number): number => A4_HEIGHT_PX - 2 * pagePadding;

/**
 * 页数换算，与预览面板同一套（`src/components/preview/index.tsx`）。
 *
 * @param contentHeight 该版面宽度下量到的真实 DOM 高度（含上下 padding）
 * @param scaleFactor  预览的缩放倍率。缩放时版面会加宽到 `210mm / scaleFactor`，
 *                     高度必须在**那个宽度下**量，否则换行位置对不上
 */
export const pagesOf = (
  contentHeight: number,
  pagePadding: number,
  scaleFactor: number
): number =>
  Math.max(
    1,
    Math.ceil((contentHeight - 2 * pagePadding) / (contentPerPage(pagePadding) / scaleFactor))
  );

/**
 * 某份内容在预览里的页数与缩放倍率。
 *
 * 缩放判定与预览共用 `computeAutoOnePage`，而不是各写一遍 ——
 * 否则「生成时预判的页数」与「用户在预览里看到的页数」会不一致。
 */
export const pageStateOf = (contentHeight: number, pagePadding: number): PageState => {
  const { scaleFactor, cannotFit } = computeAutoOnePage({
    contentHeight,
    pagePadding,
    enabled: true,
  });

  return {
    pages: pagesOf(contentHeight, pagePadding, scaleFactor),
    scaleFactor,
    cannotFit,
  };
};

/** 被提议移除的条目 */
export interface CutItem {
  id: string;
  sectionId: string;
  title: string;
  subtitle: string;
  /** AI 给出的理由。通用简历（无 JD）没有这一项 */
  reason?: string;
}

export interface FitPlan {
  targetPages: number;
  pagesBefore: number;
  /** 按本方案精简后的页数 */
  pagesAfter: number;
  removed: CutItem[];
  /** 精简后各板块剩下的条目 id */
  kept: Record<string, string[]>;
  /** 一页需要砍掉一半以上，已改按两页给建议 */
  relaxed: boolean;
  /** 已经砍到每个板块只剩一条，仍超出目标页数 */
  exhausted: boolean;
}

export interface PlanFitInput {
  selection: Record<string, string[]>;
  entities: Record<string, ProfileEntity>;
  /** AI 优先级序列（推荐强度降序），不传则按数据库里的排列顺序 */
  priorityOrder?: string[];
  pagePadding: number;
  /** 目标页数，默认 1 */
  targetPages?: number;
  /**
   * 测量一版排布的内容高度（含 padding）。离屏渲染，见 `measureResume`。
   *
   * `scaleFactor` 是这一版要按多少倍缩放 —— 缩放时版面宽度不同，
   * 换行位置不同，必须按那个宽度量。
   */
  measure: (
    selection: Record<string, string[]>,
    scaleFactor: number
  ) => Promise<number>;
  /** entityId → AI 给出的理由 */
  reasons?: Record<string, string>;
}

const cloneSelection = (selection: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(selection).map(([k, v]) => [k, [...v]]));

/** 板块顺序：系统板块在前，用户自建的追加在后 */
const sectionOrder = (selection: Record<string, string[]>): string[] => [
  ...SECTION_IDS,
  ...Object.keys(selection).filter((id) => !SECTION_IDS.includes(id)),
];

/**
 * 裁剪顺序：**优先级从低到高**，也就是从最该被删的那条开始。
 *
 * 有 AI 优先级序列时取它的倒序；序列里没有的条目（用户手动勾选的「不推荐」、
 * 分析之后才新增的经历）排在序列之后 —— 它们同样先被删，但会带上
 * 「未参与本次匹配分析」之类的说明，让用户看得见这个判断的依据。
 *
 * 没有 AI 序列（通用简历）时退化为「数据库里排得最靠后的先删」。
 */
export const buildCutOrder = (
  selection: Record<string, string[]>,
  entities: Record<string, ProfileEntity>,
  priorityOrder?: string[]
): string[] => {
  const fallback = new Map<string, number>();
  let cursor = 0;
  for (const sectionId of sectionOrder(selection)) {
    const ids = [...(selection[sectionId] ?? [])].sort(
      (a, b) => (entities[a]?.order ?? 0) - (entities[b]?.order ?? 0)
    );
    for (const id of ids) fallback.set(id, cursor++);
  }

  const ranked = new Map<string, number>();
  priorityOrder?.forEach((id, index) => ranked.set(id, index));

  const rankOf = (id: string) => ranked.get(id) ?? Number.MAX_SAFE_INTEGER;

  return Array.from(fallback.keys())
    .sort((a, b) => rankOf(a) - rankOf(b) || (fallback.get(a) ?? 0) - (fallback.get(b) ?? 0))
    .reverse();
};

const countSelected = (selection: Record<string, string[]>): number =>
  Object.values(selection).reduce((sum, ids) => sum + ids.length, 0);

/**
 * 逐条移除直到刚好装进 `targetPages`。
 *
 * 每次只删一条、删完重新测量 —— 条目的高度差很大（一条三行的项目经历
 * 抵得上四条一行的工作经验），按条数估算会得到很差的方案。
 */
const cutToFit = async (
  input: PlanFitInput,
  targetPages: number,
  pagesBefore: number,
  scaleFactor: number
): Promise<FitPlan> => {
  const kept = cloneSelection(input.selection);
  const remaining: Record<string, number> = {};
  for (const [sectionId, ids] of Object.entries(kept)) remaining[sectionId] = ids.length;

  const removed: CutItem[] = [];
  let pages = pagesBefore;

  if (pagesBefore > targetPages) {
    for (const id of buildCutOrder(input.selection, input.entities, input.priorityOrder)) {
      const entity = input.entities[id];
      if (!entity) continue;

      // 每个板块至少留一条 —— 删空会让整个板块从简历上消失，
      // 那是结构性改动，该由用户自己在编辑器里决定，不该由「刚好一页」顺手做掉
      if ((remaining[entity.sectionId] ?? 0) <= 1) continue;

      kept[entity.sectionId] = kept[entity.sectionId].filter((x) => x !== id);
      remaining[entity.sectionId] -= 1;
      removed.push({
        id,
        sectionId: entity.sectionId,
        title: entity.title,
        subtitle: entity.subtitle,
        reason: input.reasons?.[id],
      });

      pages = pagesOf(await input.measure(kept, scaleFactor), input.pagePadding, scaleFactor);
      if (pages <= targetPages) break;
    }
  }

  return {
    targetPages,
    pagesBefore,
    pagesAfter: pages,
    removed,
    kept,
    relaxed: false,
    exhausted: pages > targetPages,
  };
};

/**
 * 算出一份「该删哪几条」的方案。**不改动任何数据** —— 应用与否由用户决定。
 *
 * 已经装得下时返回 `removed: []`，调用方据此跳过提议界面。
 */
export const planFit = async (input: PlanFitInput): Promise<FitPlan> => {
  const targetPages = input.targetPages ?? 1;

  // 先在原尺寸下量一次，拿它决定预览会缩到多少
  const raw = await input.measure(input.selection, 1);
  const { scaleFactor } = computeAutoOnePage({
    contentHeight: raw,
    pagePadding: input.pagePadding,
    enabled: true,
  });

  // 要缩放了，就得按缩放后的版面重量一次 —— 版面宽度不同，换行位置不同
  const effective = scaleFactor === 1 ? raw : await input.measure(input.selection, scaleFactor);
  const pagesBefore = pagesOf(effective, input.pagePadding, scaleFactor);

  const plan = await cutToFit(input, targetPages, pagesBefore, scaleFactor);
  if (plan.removed.length === 0) return plan;

  // 第 3 步：一页要砍掉一半以上，不如放宽到两页 ——
  // 为了省一页纸删掉大半经历，边际收益是负的
  if (targetPages === 1 && plan.removed.length * 2 > countSelected(input.selection)) {
    const relaxed = await cutToFit(input, 2, pagesBefore, scaleFactor);
    return { ...relaxed, relaxed: true };
  }

  return plan;
};
