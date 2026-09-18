import type { ProfileEntity } from "@/types/profile";
import { renderCategoryVocabulary } from "./categories";
import { orderEntitiesForPrompt, stripHtml } from "@/lib/match/buildMatchPrompt";

/**
 * 经历自动归类的提示词。
 *
 * 与 `buildMatchPrompt` 分开，而不是复用它的 `serializeEntity`：
 * 那个序列化里包含技能、成果、时间，是给**排序**用的；这里只需要
 * 「这是什么」——标题、角色、一段描述。共用的话，改排序 prompt
 * 会顺带改掉归类 prompt 的行为，而两者各有各的版本号。
 *
 * 借用 `orderEntitiesForPrompt` 是因为**可复现性**：同一份数据必须产生
 * 完全相同的条目顺序，那套排序规则（板块 → 时间 → id）已经测过了，不必重写。
 */

export const TAG_PROMPT_VERSION = "t1";

/** 单条描述进入 prompt 的最大字符数 —— 归类不需要全文 */
const DESCRIPTION_MAX_CHARS = 200;

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

const serializeEntity = (entity: ProfileEntity, index: number): string =>
  [
    `${index + 1}. [${entity.id}] ${entity.title} | ${entity.subtitle || "未标注"} | ${
      entity.dateRange || "未标注"
    }`,
    `   描述：${truncate(stripHtml(entity.description), DESCRIPTION_MAX_CHARS) || "（无）"}`,
  ].join("\n");

export interface BuildTagPromptInput {
  entities: ProfileEntity[];
}

/**
 * **必须是纯函数**：不读全局状态、不调 `Date.now()` / `Math.random()`、
 * 不依赖 `Object.keys()` 顺序。给定相同输入逐字节相同 —— 由单元测试断言。
 */
export const buildTagPrompt = (input: BuildTagPromptInput): string => {
  const ordered = orderEntitiesForPrompt(input.entities);
  const entityList = ordered.map(serializeEntity).join("\n");

  return `你是一个经历归类助手。请为下面每一条经历选一个**类别**。

【可选类别】（只能从这些里选，不要自己造）
${renderCategoryVocabulary()}

【判断规则】
1. 工作与项目按**主营业务所属行业**归类，不看职位名称。比如「某银行的算法工程师」
   归金融，不归互联网。
2. 没有行业属性的条目按内容归类：在校科研/竞赛/学生组织归学术，奖项归荣誉，
   语言能力归语言。
3. **只能选一个**类别，填在 category 字段里。
4. 只能使用上面列出的类别原文（如「金融」「学术」），不要写别的说法。
5. 每条经历都必须出现，一条都不能漏。

【经历清单】
${entityList}

【输出格式】
只输出 JSON，不要任何其他文字：
{
  "items": [
    { "id": "条目 id，必须与输入一致", "category": "从可选类别里选一个" }
  ]
}`;
};
