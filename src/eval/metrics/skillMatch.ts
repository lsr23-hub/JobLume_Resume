/**
 * 「两处描述是否在说同一个缺口」的判定。
 *
 * 人工标注写的是复合长句（「复杂数据可视化经验（Canvas/WebGL/图表库）」），
 * 模型给的是原子术语（「图表库实战」）—— 逐字比对认不出是同一个缺口。
 * 所以需要一层模糊匹配。但**放宽到哪一档，是这套评测里最容易自欺的一步**：
 * 每放宽一档，召回就好看一点，而宽到一定程度它会把什么都说成同一个东西。
 *
 * 因此规则只认三种证据：
 *   1. 一方包含另一方；
 *   2. 共享一个长度 ≥ 2 的拉丁术语（Python、K8s）；
 *   3. 共享一段长度 ≥ 3 的极大公共子串，**且它不是套话词的一部分**。
 *
 * 第 3 条的两个限定都是实测逼出来的，两条都拿真实输出验过：
 *
 * - **长度 ≥ 3**：「客户分层与产品持有分析」和「零售客户经营数据经验」共享
 *   的「客户」只有 2 字。中文里 2 字重叠太容易碰巧出现，拿它当证据会把
 *   JD 里两条不同的要求认成同一条。
 * - **不能落在套话词里**：「业务经验」与「服务经验」共享「务经验」——
 *   把「服务」切成两半得来的；而「高并发线上服务经验」与「推荐系统业务经验」
 *   干脆一起共享整个「业务经验」。两处都只是套话，靠它判同一件事，
 *   召回凭空多一档。所以判据是**被套话词包含**，不论切没切断。
 *
 * 已知边界：字符串匹配认不出「容器化部署 = Docker/K8s」这类同义关系，
 * 也认不出只有 2 字的主题词（「推荐」「零售」）。这类对在测试里显式标成
 * known limitation，不予计分，也不假装判对 —— 它们是真漏，
 * 只是漏在匹配器上，不在模型上。**这让缺失项召回变成一个下界**：
 * 真实水平只会比它高，不会更低。
 */

/** 归一化：小写、去空白与常见标点，让「Python 」和「python」算同一条 */
export const normalizeSkill = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\s·、,，;；/|（）()【】\[\]]/g, "")
    .trim();

/** 拉丁/数字词 */
export const latinTokens = (text: string): string[] =>
  text.match(/[a-z][a-z0-9+#.]*/g) ?? [];

/**
 * 中文重叠的最短长度。
 *
 * 卡在 3 而不是 2：2 字重叠在中文里太容易碰巧出现 ——
 * 「客户分层与产品持有分析」与「零售客户经营数据经验」就共享「客户」，
 * 而它们是 JD 里两条不同的要求。
 */
const MIN_RUN = 3;

/**
 * HR 套话词表。
 *
 * 只收「放在任何 JD 里都不携带领域信息」的词。判断方式是
 * `词表里有某个词包含这段重叠` —— 所以「业务经验」这一条同时挡住
 * 「业务经验」和它切出来的「务经验」。
 *
 * 刻意**不**收「平台」「系统」「数据」「模型」这类词：它们在别处是
 * 实打实的领域术语（特征平台、推荐系统），收进来会误杀真匹配。
 */
const BOILERPLATE = [
  "经验",
  "能力",
  "背景",
  "要求",
  "相关",
  "优先",
  "加分",
  "具备",
  "熟悉",
  "掌握",
  "了解",
  "以及",
  "相关经验",
  "工作经验",
  "项目经验",
  "业务经验",
  "服务经验",
  "实践经验",
  "实战经验",
  "行业经验",
  "从业经验",
  "业务能力",
  "服务能力",
  "沟通能力",
  "学习能力",
  "协作能力",
  "抗压能力",
  "相关背景",
  "相关要求",
];

/** 这段重叠是不是完全落在某个套话词内部 */
const isBoilerplateRun = (run: string): boolean =>
  BOILERPLATE.some((word) => word.includes(run));

/**
 * 所有**极大**公共子串（不被另一个公共子串包含的那些）。
 *
 * 只要有一个极大公共子串不是套话，就算有实质重叠 —— 因为套话内部的
 * 任意片段一定也被某个极大公共子串包含，反过来说，非套话的片段
 * 必然属于某个非套话的极大公共子串。
 */
export const maximalCommonRuns = (a: string, b: string): string[] => {
  const rows = a.length;
  const cols = b.length;
  if (rows === 0 || cols === 0) return [];

  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const runs = new Set<string>();

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      if (a[i] !== b[j]) continue;
      dp[i][j] = (i > 0 && j > 0 ? dp[i - 1][j - 1] : 0) + 1;
      const endsRun =
        i + 1 >= rows || j + 1 >= cols || a[i + 1] !== b[j + 1];
      if (endsRun && dp[i][j] >= 2) {
        runs.add(a.slice(i - dp[i][j] + 1, i + 1));
      }
    }
  }

  return Array.from(runs);
};

/**
 * 两处描述是否指同一个缺口。
 *
 * 阈值卡在「不能把 JD 的干扰项也算对」上：fin-04 实测模型把
 * 「中共党员 / 驾照 / 篮球特长」当成档案缺失的技能，这些与
 * 「实时流计算」没有任何公共子串，必须判为不匹配。
 */
export const isSameSkill = (a: string, b: string): boolean => {
  const na = normalizeSkill(a);
  const nb = normalizeSkill(b);
  if (!na || !nb) return false;

  const shorter = na.length <= nb.length ? na : nb;
  const contains = na.includes(nb) || nb.includes(na);
  if (contains && !isBoilerplateRun(shorter)) return true;

  const lb = new Set(latinTokens(nb));
  if (latinTokens(na).some((t) => t.length >= 2 && lb.has(t))) return true;

  return maximalCommonRuns(na, nb).some(
    (run) => run.length >= MIN_RUN && !isBoilerplateRun(run)
  );
};
