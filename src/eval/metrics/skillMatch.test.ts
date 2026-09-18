import { describe, expect, it } from "vitest";
import { isSameSkill } from "./skillMatch";

/**
 * 「缺失项召回」的匹配器标注集。
 *
 * 全部 104 对取自 `eval-results/` 下**两次真实运行**的原始输出与人工标注的
 * 叉乘 —— 不是编出来的例子，也没有按规则挑过。**规则只能在这张表上选，
 * 不能拿最终指标调**：拿指标调的话，每放宽一档召回就涨一点，最后一定
 * 「达标」，而那个数字衡量的是匹配器有多松，不是模型有多准。
 *
 * 两条规则改动都是在这张表上比的：
 * - 公共子串门槛 2 字 → 3 字：2 字那版把「客户」当成证据，多 2 处误判
 * - 「套话碎片」→「凡落在套话词内」：只挡碎片那版把「业务经验」当成证据，
 *   多 1 处误判（「高并发线上服务经验」↔「推荐系统业务经验」）
 *
 * `known` 那一列是字符串匹配**认不出**的两类关系：同义（容器化部署 = Docker/K8s）
 * 与 2 字主题词（「推荐」「零售」）。它们计入 `same` 但不计入得分 —— 标出来
 * 是为了不让它们悄悄消失：这几对的缺口是真的漏掉了，只是漏在匹配器上，
 * 不是模型上。**所以这张表同时说明：缺失项召回是一个下界。**
 */

interface Row {
  /** 人工标注的缺口 */
  gold: string;
  /** 模型报的缺口 */
  model: string;
  /** 两者是否指同一个缺口 */
  same: boolean;
  /** 字符串匹配无法判定的原因 —— 不计分 */
  known?: string;
}

const row = (gold: string, model: string, same: boolean, known?: string): Row => ({
  gold,
  model,
  same,
  known,
});

const PAIRS: Row[] = [
  // ── fe-01 前端 × 可视化 ──
  row("大数据量渲染（万行级表格 / 虚拟滚动）", "大数据表格万行级渲染", true),
  row("大数据量渲染（万行级表格 / 虚拟滚动）", "内存优化", false),
  row("内存优化", "大数据表格万行级渲染", false),
  row("内存优化", "内存优化", true),
  row("大数据量渲染（万行级表格 / 虚拟滚动）", "开源项目贡献", false),
  row("大数据量渲染（万行级表格 / 虚拟滚动）", "技术管理经验（正式）", false),
  row("内存优化", "开源项目贡献", false),
  row("内存优化", "技术管理经验（正式）", false),
  row("大数据量渲染（万行级表格 / 虚拟滚动）", "开源项目贡献经历", false),
  row("内存优化", "开源项目贡献经历", false),

  // ── fe-02 前端 × Node 服务端 ──
  row("Node.js 服务端开发经验", "Node.js服务端开发", true),
  row("Node.js 服务端开发经验", "BFF层设计", false), // JD 从未要求 BFF
  row("Node.js 服务端开发经验", "Express/Koa/Nest框架", true, "Express/Koa/Nest 是 Node 框架，靠字面认不出"),
  row("Node.js 服务端开发经验", "Redis", false), // JD 要求 3，与 Node 是两条要求
  row("Node.js 服务端开发经验", "Docker/K8s", false), // JD 要求 4
  row("Node.js 服务端开发经验", "微服务架构", false), // JD 要求 4
  row("微服务与容器化部署经验", "Node.js服务端开发", false),
  row("微服务与容器化部署经验", "BFF层设计", false),
  row("微服务与容器化部署经验", "Express/Koa/Nest框架", false),
  row("微服务与容器化部署经验", "Redis", false),
  row("微服务与容器化部署经验", "Docker/K8s", true, "容器化部署 = Docker/K8s 是同义，不是同字"),
  row("微服务与容器化部署经验", "微服务架构", true),
  row("Node.js 服务端开发经验", "Node.js", true),
  row("微服务与容器化部署经验", "Node.js", false),
  row("Node.js 服务端开发经验", "Express/Koa/Nest", true, "同上：Express/Koa/Nest 是 Node 框架"),
  row("Node.js 服务端开发经验", "Docker", false),
  row("Node.js 服务端开发经验", "K8s", false),
  row("微服务与容器化部署经验", "Express/Koa/Nest", false),
  row("微服务与容器化部署经验", "Docker", true, "容器化部署 = Docker"),
  row("微服务与容器化部署经验", "K8s", true, "容器化部署 = K8s"),
  row("Node.js 服务端开发经验", "MySQL", false), // JD 要求 3
  row("Node.js 服务端开发经验", "容器化部署", false),
  row("微服务与容器化部署经验", "MySQL", false),
  row("微服务与容器化部署经验", "容器化部署", true),

  // ── fin-01 量化 × 机器学习选股 ──
  row("顶会论文或开源项目贡献", "3年以上量化研究经验（仅约2年）", false),
  row("顶会论文或开源项目贡献", "TensorFlow", false),
  row("顶会论文或开源项目贡献", "CFA/FRM证书", false),
  row("顶会论文或开源项目贡献", "3年以上量化研究经验（有实习+2年+，接近）", false),
  row("顶会论文或开源项目贡献", "实盘策略或指数增强产品经验（有指数增强模块）", false),
  row("顶会论文或开源项目贡献", "3年以上量化研究经验（候选人约2年+实习）", false),
  row("顶会论文或开源项目贡献", "TensorFlow实战", false),
  row("顶会论文或开源项目贡献", "CFA", false),
  row("顶会论文或开源项目贡献", "FRM", false),
  row("顶会论文或开源项目贡献", "开源项目贡献", true),
  row("顶会论文或开源项目贡献", "顶会论文", true),

  // ── fin-02 量化 × 零售数据分析 ──
  row("零售客户经营数据统计与报表经验", "零售客户经营数据经验", true),
  row("零售客户经营数据统计与报表经验", "客户分层与产品持有分析", false), // 职责 1 与职责 2 是两件事
  row("客户分层与产品持有分析", "零售客户经营数据经验", false),
  row("客户分层与产品持有分析", "客户分层与产品持有分析", true),
  row("零售客户经营数据统计与报表经验", "2年以上金融行业数据分析（零售方向）", true, "只共享 2 字主题词「零售」"),
  row("零售客户经营数据统计与报表经验", "客户分层与交易行为分析经验", false),
  row("零售客户经营数据统计与报表经验", "客户分层与产品持有分析经验", false),
  row("零售客户经营数据统计与报表经验", "证券零售业务经验", true, "只共享 2 字主题词「零售」"),
  row("客户分层与产品持有分析", "2年以上金融行业数据分析（零售方向）", false),
  row("客户分层与产品持有分析", "客户分层与交易行为分析经验", true),
  row("客户分层与产品持有分析", "客户分层与产品持有分析经验", true),
  row("客户分层与产品持有分析", "证券零售业务经验", false),

  // ── fin-03 量化 × 推荐算法 ──
  row("推荐/搜索/广告业务经验", "信息流推荐业务经验", true, "只共享 2 字主题词「推荐」"),
  row("推荐/搜索/广告业务经验", "亿级用户行为特征实时计算", false),
  row("高并发线上服务经验", "信息流推荐业务经验", false), // ← 曾因「务经验」被判成同一个缺口
  row("高并发线上服务经验", "亿级用户行为特征实时计算", false),
  row("推荐/搜索/广告业务经验", "信息流推荐召回与排序实战", true, "只共享 2 字的主题词「推荐」"),
  row("高并发线上服务经验", "信息流推荐召回与排序实战", false),
  row("推荐/搜索/广告业务经验", "TensorFlow等框架", false),
  row("高并发线上服务经验", "TensorFlow等框架", false),
  row("推荐/搜索/广告业务经验", "亿级用户行为实时计算", false),
  row("推荐/搜索/广告业务经验", "信息流推荐召回与排序模型", true, "只共享 2 字主题词「推荐」"),
  row("推荐/搜索/广告业务经验", "推荐系统业务经验", true, "只共享 2 字主题词「推荐」"),
  row("推荐/搜索/广告业务经验", "推荐领域前沿落地", false), // 对应职责 4，不是要求 2 的实战经验
  row("推荐/搜索/广告业务经验", "顶会论文", false),
  row("高并发线上服务经验", "亿级用户行为实时计算", false),
  row("高并发线上服务经验", "信息流推荐召回与排序模型", false),
  row("高并发线上服务经验", "推荐系统业务经验", false), // 曾因共享整个「业务经验」被判成同一个缺口
  row("高并发线上服务经验", "推荐领域前沿落地", false),
  row("高并发线上服务经验", "顶会论文", false),

  // ── fin-04 量化 × 信贷风控（JD 里混了党员/驾照/篮球干扰项）──
  row("实时流计算（Flink/Spark Streaming）", "中共党员", false),
  row("实时流计算（Flink/Spark Streaming）", "驾照", false),
  row("实时流计算（Flink/Spark Streaming）", "篮球特长", false),
  row("信贷业务经验", "中共党员", false),
  row("信贷业务经验", "驾照", false),
  row("信贷业务经验", "篮球特长", false),

  // ── jun-01 应届 × 用户增长数据分析 ──
  row("A/B 实验经验", "A/B实验设计与评估", true),
  row("A/B 实验经验", "用户增长业务经验", false), // 只共享「经验」二字
  row("A/B 实验经验", "R语言实际应用", false),
  row("A/B 实验经验", "假设检验", false),
  row("A/B 实验经验", "用户增长分析", false),

  // ── jun-02 应届 × 数据开发 ──
  row("Java / Scala 编程能力", "Java", true),
  row("Java / Scala 编程能力", "Scala", true),
  row("Java / Scala 编程能力", "Spark", false), // JD 要求 2 里 Java/Scala 与 Spark/Flink 是两件事
  row("Java / Scala 编程能力", "Flink", false),
  row("Java / Scala 编程能力", "Hadoop", false),
  row("Java / Scala 编程能力", "调度工具", false),
  row("Spark / Flink 大数据框架", "Java", false),
  row("Spark / Flink 大数据框架", "Scala", false),
  row("Spark / Flink 大数据框架", "Spark", true),
  row("Spark / Flink 大数据框架", "Flink", true),
  row("Spark / Flink 大数据框架", "Hadoop", false),
  row("Spark / Flink 大数据框架", "调度工具", false),
  row("数据仓库维度建模理论", "Java", false),
  row("数据仓库维度建模理论", "Scala", false),
  row("数据仓库维度建模理论", "Spark", false),
  row("数据仓库维度建模理论", "Flink", false),
  row("数据仓库维度建模理论", "Hadoop", false),
  row("数据仓库维度建模理论", "调度工具", false),
];

describe("isSameSkill —— 用真实输出与人工标注的叉乘当尺子", () => {
  const decidable = PAIRS.filter((p) => !p.known);

  it("每一对都判在人工标注上", () => {
    const wrong = decidable.filter((p) => isSameSkill(p.gold, p.model) !== p.same);
    expect(wrong.map((p) => `${p.gold} ↔ ${p.model}`)).toEqual([]);
  });

  it("标注集就是两次运行跑出来的全部 104 对，不是挑出来的样本", () => {
    expect(PAIRS).toHaveLength(104);
    expect(PAIRS.filter((p) => p.same)).toHaveLength(28);
    expect(PAIRS.filter((p) => !p.same)).toHaveLength(76);
    // 反例远多于正例是真实分布：模型报的缺口里，大部分与人工标注的缺口不是同一件事
    expect(PAIRS.filter((p) => p.known)).toHaveLength(11);
  });

  it("已知盲区：同义关系与 2 字主题词靠字符串认不出，这几对必然是假阴性", () => {
    // 不假装判对 —— 断言它们确实判错。将来若有人加了别名机制，
    // 这条测试会失败，提醒把这六对降级成普通行
    for (const p of PAIRS.filter((x) => x.known)) {
      expect(isSameSkill(p.gold, p.model)).toBe(false);
    }
  });
});

describe("isSameSkill —— 套话不算证据", () => {
  it("「业务经验」与「服务经验」共享的「务经验」是词缀，不是同一个缺口", () => {
    // 这条回归的由来：修之前 isMatch 走「最长公共子串 ≥3」，
    // 「务经验」正好 3 字，于是「高并发线上服务经验」被判成
    // 「信息流推荐业务经验」的同一个缺口 —— 召回凭空多了一档
    expect(isSameSkill("高并发线上服务经验", "信息流推荐业务经验")).toBe(false);
  });

  it("一起共享整个套话词「业务经验」，同样不算同一个缺口", () => {
    // 区别于上一条：这次重叠落在词的自然边界上，但它是套话，
    // 不因为「恰好切成一个完整的词」就变成证据
    expect(isSameSkill("高并发线上服务经验", "推荐系统业务经验")).toBe(false);
  });

  it("只共享「经验」二字不算数", () => {
    expect(isSameSkill("A/B 实验经验", "用户增长业务经验")).toBe(false);
    expect(isSameSkill("高并发线上服务经验", "亿级用户行为特征实时计算")).toBe(false);
  });

  it("有实质重叠仍然要判对", () => {
    expect(isSameSkill("微服务与容器化部署经验", "微服务架构")).toBe(true);
    expect(isSameSkill("数据仓库维度建模理论", "数据仓库建模")).toBe(true);
    expect(isSameSkill("客户分层与产品持有分析", "客户分层与交易行为分析经验")).toBe(true);
  });

  it("隔着套话的实质重叠也认得出 —— 套话只否定「全靠套话撑着的重叠」", () => {
    expect(
      isSameSkill("零售客户经营数据统计与报表经验", "零售客户经营数据经验")
    ).toBe(true);
  });
});
