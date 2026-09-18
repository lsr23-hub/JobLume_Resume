import type { ProfileEntity } from "@/types/profile";
import { SECTION_DEFS } from "@/config/sections";

/**
 * 提示词版本。**改动判断规则必须升版本** —— 指纹缓存拿它做失效判定，
 * 不升的话用户手上那份旧结果会被当成仍然有效（docs/03 §4.4），
 * 而且旧 schema 的缓存会被新界面读取。
 *
 * v2：判断标准从「宁可多推荐」改为「按是否值得占用简历版面判断」。
 * v3：v2 曾按类别排除荣誉/社团/语言能力，漏判率反而升到 13.1%，改为不排除。
 * v4：**从「判定 + 排序」改为「只排序」**。
 *
 *     v1~v3 都在让模型输出「推荐/不推荐」这个二分标签，实测两版都过不了：
 *     v1 推荐率 79%（人工金标准 43%），v3 误判率 45.8%。
 *     根因不是模型不会判，而是**它无从知道该在哪划线** ——
 *     那条线取决于用户这份简历放得下几条，而这个信息不在 prompt 里。
 *
 *     所以把划线从模型手里拿走：模型只负责排序（它擅长，NDCG 88.8%），
 *     截断交给代码，名额由用户在界面上定。这也是 docs/03 §3.6
 *     「AI 不预设勾选」的彻底版 —— 连"推荐"这个标签都不由 AI 下。
 *
 * v5：**coverage 从「模型一口气给结论」换成结构化要求项**（docs/06 P7）。
 *
 *     v4 的 `summary.coverage` 是三个字符串数组，校验器只做「丢非数组、丢空串」，
 *     没有任何交叉校验 —— 于是每条覆盖判定都指不出具体经历，用户无从核对，
 *     实测三次运行各报各的（fe-01 的「大数据量渲染」3 次里只报出 1 次）。
 *
 *     现在改成逐条要求带 kind / status / entityIds / sourceQuote：
 *     判定必须指出支撑它的是哪条经历，引不出就由代码降级；
 *     每条要求还要给出 JD 原文依据，引不出原文的标为「推断」而不是丢掉
 *     （隐含要求本来就引不出原文）。
 */
export const PROMPT_VERSION = "v5";

/** 打「★ 优先」标记的条目数 */
export const TOP_N = 5;

/**
 * 采样参数。**由服务端注入，不接受客户端传值** ——
 * 防止前端哪天误传一个高温度，静默破坏结果稳定性且极难排查。
 */
export const LLM_PARAMS = {
  temperature: 0,
  seed: 42,
} as const;

/** 单条描述进入 prompt 的最大字符数 */
const DESCRIPTION_MAX_CHARS = 300;

/** 去掉 HTML 标签并统一空白符 —— HTML 里的换行与缩进差异不应进入 prompt */
export const stripHtml = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

/**
 * 板块的规范顺序。
 *
 * 用 SECTION_DEFS 的顺序而非数据库的 `sectionOrder` —— 后者用户可以拖拽，
 * 依赖它会让同一份数据在不同时刻生成不同的 prompt。
 */
const SECTION_RANK: Record<string, number> = Object.fromEntries(
  SECTION_DEFS.map((def, index) => [def.id, index])
);

/**
 * 条目序列化顺序：板块顺序 → endTimestamp 降序 → id 升序。
 *
 * **这是可复现性的关键**：同一份数据库必须产生完全相同的条目顺序。
 * 缺失 endTimestamp 的排在末尾，且不调用 `Date.now()` 兜底。
 */
export const orderEntitiesForPrompt = (entities: ProfileEntity[]): ProfileEntity[] =>
  [...entities].sort((a, b) => {
    const rankA = SECTION_RANK[a.sectionId] ?? Number.MAX_SAFE_INTEGER;
    const rankB = SECTION_RANK[b.sectionId] ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    // 进行中的条目视为最新
    const tsA = a.isCurrent ? Number.MAX_SAFE_INTEGER : (a.endTimestamp ?? Number.MIN_SAFE_INTEGER);
    const tsB = b.isCurrent ? Number.MAX_SAFE_INTEGER : (b.endTimestamp ?? Number.MIN_SAFE_INTEGER);
    if (tsA !== tsB) return tsB - tsA;

    return a.id.localeCompare(b.id);
  });

const serializeEntity = (entity: ProfileEntity, index: number): string => {
  const desc = truncate(stripHtml(entity.description), DESCRIPTION_MAX_CHARS);
  const skills = entity.skills.length > 0 ? entity.skills.join("、") : "未标注";
  const metrics = entity.metrics.length > 0 ? entity.metrics.join("、") : "未标注";

  return [
    `${index + 1}. [${entity.id}] ${entity.title} | ${entity.subtitle} | ${entity.dateRange}`,
    `   描述：${desc || "（无）"}`,
    `   技能：${skills}`,
    `   成果：${metrics}`,
  ].join("\n");
};

export interface BuildMatchPromptInput {
  jdRaw: string;
  company: string;
  position: string;
  entities: ProfileEntity[];
}

/**
 * 构造匹配分析的提示词。
 *
 * **必须是纯函数**：不读全局状态、不调用 `Date.now()` / `Math.random()`、
 * 不依赖 `Object.keys()` 的返回顺序。给定相同输入，返回值逐字节相同 ——
 * 这是可复现性的第二道防线，由单元测试直接断言。
 */
export const buildMatchPrompt = (input: BuildMatchPromptInput): string => {
  const ordered = orderEntitiesForPrompt(input.entities);
  const entityList = ordered.map(serializeEntity).join("\n\n");

  const jdSection = [
    `公司：${input.company}`,
    `职位：${input.position}`,
    "",
    "【岗位描述原文】",
    input.jdRaw.trim(),
  ].join("\n");

  return `你是资深招聘顾问。请**先读懂这份 JD 要求什么**，再帮求职者把经历库里的条目按「放进这份简历的优先级」排序。

【目标岗位】
${jdSection}

【候选经历】
${entityList}

【第一步：把 JD 要求拆成条目】
逐条列出这份 JD 提出的要求，每条给出：
- kind：must（硬性要求）/ nice（加分项）/ duty（岗位职责）
- text：这条要求说的是什么，一句话
- keys：这条要求的**原子关键词**，1~3 个词组，写成"Python""量化研究经验"这种粒度，
  **不要写成整句** —— 它们要拿去跟技能逐项比对
- sourceQuote：**从 JD 原文里原样摘出的片段**。JD 没明写、由你推断出来的，留空字符串
拆要求以 JD 原文为准，不要根据职位名称推测。
职责（duty）也要列出来，但职责不判断缺不缺 —— 没做过 JD 写的某段职责是换工作的常态，不是缺陷。

【第二步：逐条判断覆盖情况】
对每条要求判断求职者的经历库是否支撑：
- status：covered（有经历明确支撑）/ weak（支撑薄弱）/ missing（没有支撑）
- entityIds：支撑这条要求的经历 id 列表；status 为 missing 时给空数组
**标 covered 就必须能指出具体经历** —— 指不出具体是哪条，就不要标 covered。

【第三步：把全部候选经历按优先级排序】
排序依据是：这条经历能支撑上面列出的哪几条要求。支撑得越直接、越硬，排得越前。
- 能支撑 must 类要求的条目必须排在前面。漏掉它会让人以为自己不够格，白跑一趟。
- 排序依据是**与要求的相关程度**，不是这条经历本身是否优秀。一条很漂亮的经历，
  如果与岗位无关，也排在后面。
- 缺少量化成果、描述写得不好，都不影响排序 —— 那是措辞问题。
- 荣誉、社团、语言能力这类条目**不因类别而靠后** —— 只要它对应某条要求，照样往前提。
- 每条候选经历都必须出现，一条都不能漏。

【输出格式】
只输出 JSON，不要任何其他文字：
{
  "requirements": [
    {
      "id": "r1（依次 r2、r3…）",
      "text": "这条要求，一句话",
      "keys": ["原子关键词"],
      "kind": "must",
      "status": "covered",
      "entityIds": ["支撑它的经历 id"],
      "sourceQuote": "JD 原文片段；推断出来的留空字符串"
    }
  ],
  "items": [
    {
      "id": "条目 id，必须与输入一致",
      "reason": "一句话说明它对应哪条要求，20 字以内。**用要求本身的话说，不要写 r1 / must 这类内部标识** —— 这行字是给用户看的",
      "matchedSkills": ["与该条要求相关的技能，最多 5 个"],
      "requirementIds": ["它支撑的要求 id"]
    }
  ],
  "summary": {
    "advice": "整体建议，60 字以内"
  }
}

注意：
- **requirements 写在前面、items 写在后面** —— 先把要求定下来，排序才有依据。
- items 里的 reason 字段**不要出现 r1、must 这类内部标识** —— 它是给用户看的一句话，
  要写要求本身的内容（"对应 5 年前端经验要求"），不是写编号。
- items 数组的**顺序**就是优先级，从高到低。
- 输出要紧凑：这是一次全量排序，条目多时冗长的字段会把回答截断。`;
};
