/**
 * 大档案 canary —— 专门盯「输出被长度上限截断」这个故障模式。
 *
 * 为什么要单独一个脚本：评测数据集里最大的案例只有 20 条经历、输出约 1200 token，
 * 而**真实档案没有条数上限**。实测撞上过 8192 上限导致 JSON 截断，那次是数据集
 * 之外的档案 —— 也就是说这个故障在评测里**永远复现不出来**。
 *
 * 这里合成一份大档案，把 prompt 造到和真实大档案同一个量级，跑一次真实调用，
 * 看 `completionTokens` 离上限有多远、有没有被截断。不做指标，只看这一件事。
 *
 *   DEEPSEEK_API_KEY=... npx tsx scripts/match-canary.ts          # 默认 50 条
 *   DEEPSEEK_API_KEY=... npx tsx scripts/match-canary.ts 80       # 指定条数
 *
 * 超限被截断时 `callLLM` 会返回可重试的失败（`finish_reason === "length"`），
 * 所以这个脚本**退出码非 0** 就等于防线生效了一次。
 */
import { buildMatchPrompt } from "../src/lib/match/buildMatchPrompt";
import { callLLM } from "../src/lib/server/llm";
import { parseMatchPayload } from "../src/lib/match/validateMatchResult";
import type { ProfileEntity } from "../src/types/profile";

const COMPLETION_LIMIT = 8192;

const SECTIONS = ["experience", "projects", "education", "campus", "honors"] as const;

const SKILL_POOL = [
  "React", "TypeScript", "Node.js", "Python", "SQL", "Docker", "Kubernetes",
  "GraphQL", "Redis", "Kafka", "PyTorch", "Spark", "ClickHouse", "Airflow",
];

/**
 * 合成一份大档案。
 *
 * 描述写得和真实简历同一个量级（每条 3~4 个要点），否则测出来的 token 数
 * 会偏低、canary 就失去意义 —— 它要逼近真实档案的长度，不是走个形式。
 */
const makeEntities = (count: number): ProfileEntity[] =>
  Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const sectionId = SECTIONS[index % SECTIONS.length];
    return {
      id: `canary-${n}`,
      type: "custom",
      sectionId,
      title: `合成条目 ${n}`,
      subtitle: `角色 ${n} · 团队规模 ${(n % 7) + 1} 人`,
      dateRange: `${2015 + (index % 9)}/0${(index % 9) + 1} - ${2016 + (index % 9)}/1${index % 2}`,
      description: [
        `<ul>`,
        `<li>负责模块 ${n} 的架构设计与落地，把关键路径耗时从 ${800 + n}ms 降到 ${200 + n}ms</li>`,
        `<li>主导跨团队协作，覆盖 ${3 + (n % 5)} 条业务线，服务 ${(n % 9) + 1}0 万日活</li>`,
        `<li>推动流程改进，交付周期从 ${(n % 20) + 5} 天压缩到 ${(n % 4) + 1} 天</li>`,
        `<li>带教 ${(n % 4) + 1} 名成员，沉淀 ${(n % 6) + 2} 篇内部文档</li>`,
        `</ul>`,
      ].join(""),
      tags: ["合成"],
      skills: [SKILL_POOL[index % SKILL_POOL.length], SKILL_POOL[(index + 3) % SKILL_POOL.length]],
      metrics: [`耗时降低 ${(n % 60) + 10}%`],
      order: index,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  });

const JD = `岗位名称：高级全栈工程师
【岗位职责】
1. 负责核心业务系统的架构设计与关键模块开发；
2. 主导性能治理，优化首屏、接口与数据库查询；
3. 建设并维护团队组件库与工程化体系；
4. 与产品、设计、数据团队协作推动方案落地。
【任职要求】
1. 本科及以上学历，计算机相关专业，5 年以上开发经验；
2. 精通 React 与 TypeScript，熟悉 Node.js；
3. 熟悉数据库设计与查询优化，了解 Redis / Kafka；
4. 有容器化部署与 CI/CD 实践经验；
5. 具备良好的沟通协作能力，能独立负责中等规模项目。
【加分项】
1. 有低代码或搭建平台经验；
2. 有开源项目贡献；
3. 有团队带教经验。`;

const main = async () => {
  const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
  if (!apiKey) {
    console.error("缺少 DEEPSEEK_API_KEY 环境变量");
    process.exit(1);
  }

  const count = Number(process.argv[2] ?? 50);
  const entities = makeEntities(count);
  const prompt = buildMatchPrompt({
    jdRaw: JD,
    company: "合成公司",
    position: "高级全栈工程师",
    entities,
  });

  console.log(`canary：${count} 条合成经历，prompt ${prompt.length} 字符`);

  const started = Date.now();
  const result = await callLLM({
    modelType: "deepseek",
    apiKey,
    prompt,
    // 大档案本来就慢，给足时间；这里测的是长度不是速度
    timeoutMs: 180_000,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!result.ok) {
    console.error(`\n❌ 调用失败（${elapsed}s）：${result.error}`);
    if (result.error.includes("上限")) {
      console.error(
        `\n这就是要防的那个故障：输出撞上 ${COMPLETION_LIMIT} token 被截断。\n` +
          `好消息是它现在是一次**响亮的可重试失败**，而不是半截 JSON 静静落库。`
      );
    }
    process.exit(1);
  }

  const completion = result.usage?.completionTokens ?? 0;
  const ratio = COMPLETION_LIMIT > 0 ? completion / COMPLETION_LIMIT : 0;
  const payload = parseMatchPayload(result.raw);

  console.log(`\n✅ 调用成功（${elapsed}s）`);
  console.log(`   prompt ${result.usage?.promptTokens ?? "?"} token`);
  console.log(`   输出   ${completion} token（占上限 ${(ratio * 100).toFixed(1)}%）`);

  if (payload === null) {
    console.error("\n❌ 返回的不是合法 JSON");
    process.exit(1);
  }

  const parsed = payload as { requirements?: unknown[]; items?: unknown[] };
  const itemCount = parsed.items?.length ?? 0;
  console.log(`   解析出 requirements ${parsed.requirements?.length ?? 0} 条、items ${itemCount} 条`);

  // 漏条目算警告不算失败：校验器会把漏掉的补在末尾，用户仍看得到那段经历，
  // 只是没有理由 —— 属于质量退化，不是故障。实测 100 条时会漏 1 条。
  if (itemCount !== count) {
    console.warn(
      `\n⚠️ 模型漏了 ${count - itemCount} 条经历（校验器会补在末尾，用户仍看得到）—— ` +
        `档案到这个量级时排序开始退化`
    );
  }

  // 逼近上限时提前预警：再大一点的档案就会撞上
  if (ratio > 0.8) {
    console.warn(`\n⚠️ 已用掉 ${(ratio * 100).toFixed(0)}% 的输出预算，更大的档案会撞上限`);
  }
};

main().catch((error) => {
  console.error("canary 失败：", error);
  process.exit(1);
});
