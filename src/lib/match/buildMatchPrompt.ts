import type { ProfileEntity } from "@/types/profile";
import { SECTION_DEFS } from "@/config/sections";

/**
 * 提示词模板版本。修改 MATCH_PROMPT 时必须递增 ——
 * 它参与缓存键计算，否则用户会在升级后拿到用旧模板生成的结果且无从知晓。
 */
/**
 * 提示词版本。**改动判断规则必须升版本** —— 指纹缓存拿它做失效判定，
 * 不升的话用户手上那份旧结果会被当成仍然有效（docs/03 §4.4）。
 *
 * v2：判断标准从「宁可多推荐」改为「按是否值得占用简历版面判断」。
 *     实测 v1 的推荐率是 79%，而人工金标准是 43% —— 推荐信号失去区分度。
 * v3：v2 额外把荣誉/社团/语言能力按类别排除，结果漏判率从 2.6% 涨到 13.1%，
 *     且漏掉的正是人工标注认为该推荐的英语与奖学金。改为不按类别排除。
 */
export const PROMPT_VERSION = "v3";

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

  return `你是资深招聘顾问，帮求职者判断他的哪些经历最值得放进针对这个岗位的简历。

【目标岗位】
${jdSection}

【候选经历】
${entityList}

【任务】
1. 逐条判断每条经历是否值得放进这份简历，二选一：
   - recommended     推荐：与岗位要求相关，值得放入
   - not_recommended 不推荐：与岗位要求关系不大

2. 在判为 recommended 的条目中，按推荐强度从高到低排序，
   把最值得优先展示的 ${TOP_N} 条排在数组最前面。
   （数组顺序即推荐强度，不需要输出名次数字）

【判断规则】
1. 以 JD 原文为准，不要根据职位名称推测要求。
2. 严格按"证据"字段判定：判为 not_recommended 的条目，必须在 "evidence"
   字段中引用该条目原文中的一句话作为否定依据。标题、副标题、时间、描述
   都可以引，但要**引用连续的一段**，不要用分隔符把多个字段拼起来。
   找不到可引用的原文，就改判为 recommended —— 无法举证就不该否定。
3. 每条独立判断，不要用"A 比 B 更相关"这类相对表述来定等级。
4. 缺少量化成果不降低推荐与否。只判断与岗位的相关性。
5. 若某条经历与岗位相关但描述写得不好，仍判为 recommended，
   并在 "suggestedFocus" 中说明应该突出什么。
6. 只推荐**值得占用简历版面**的条目。简历版面有限，放进去一条就意味着
   挤掉另一条。判断标准是：这条经历能不能支撑 JD 里的某一条具体要求，
   而不是它本身是否优秀。
7. 每条 recommended 的 "reason" 必须点出它对应 JD 的哪一条要求
   （引用该要求的关键词）。说不出对应哪一条的，判 not_recommended。
8. 荣誉、社团、语言能力这类条目**不因类别而排除** —— 只要它确实对应 JD 的
   某一条要求（专业背景、学习能力、语言要求等），照常推荐。

【输出格式】
只输出 JSON，不要任何其他文字：
{
  "items": [
    {
      "id": "条目 id，必须与输入一致",
      "level": "recommended | not_recommended",
      "reason": "一句话说明判断依据，40 字以内",
      "evidence": "判为 not_recommended 时逐字引用否定依据；其余填空字符串",
      "matchedSkills": ["从该条目中提取的、与 JD 相关的技能"],
      "missingSkills": ["JD 要求但该条目未体现的技能"]
    }
  ],
  "summary": {
    "recommendedCount": 数字,
    "coverage": {
      "covered": ["JD 要求且数据库中有支撑的技能"],
      "weak": ["JD 要求但支撑薄弱的技能"],
      "missing": ["JD 要求但数据库中没有的技能"]
    },
    "advice": "整体建议，60 字以内"
  }
}`;
};
