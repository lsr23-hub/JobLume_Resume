/**
 * 经历类别的封闭词表。
 *
 * 类别是条目的**展示标签**：`tags[0]` 显示在经历列表和候选人列表上，
 * 用户可以在编辑器里直接改，也可以让模型一键归类。
 *
 * **为什么是混合词表（行业 + 内容类型）**：一半的条目（荣誉、语言、校园、
 * 学历）根本没有「行业」可归，只按行业分类等于给它们留空。
 *
 * 词表是**封闭集**：让模型从里面选，而不是自由发挥。自由发挥出来的类别
 * 每天都不一样，标签就没法横向比较；`analyzeTags` 会把对不上词表的答案丢掉。
 */

/** 给模型看的判据。写「这个类别包含什么」，而不是让模型自己猜 */
export const CATEGORY_DEFS = [
  // ── 行业：工作与项目按主营业务所属行业归类 ──
  { id: "金融", hint: "银行、证券、基金、保险、支付、量化投资、风控" },
  { id: "互联网", hint: "软件与平台、电商、社交、搜索、算法、SaaS" },
  // 「教育」与「学术」的界线要写死：前者是**用人单位**，后者是**本人学历**。
  // 不写清楚的话，学历可能被归进「教育」，于是学位和教师岗混在一起互相衰减。
  // 实测第一版词表就有这个缺口 —— 模型自己把学历归进了学术，是对的，但那是它猜的。
  { id: "教育", hint: "教育培训机构、在线教育公司（指用人单位，不含本人学历）" },
  { id: "医疗", hint: "医院、药企、医疗器械、健康管理" },
  { id: "制造", hint: "工业、硬件、汽车、能源、供应链" },
  { id: "消费零售", hint: "零售、品牌、渠道运营、本地生活" },
  { id: "公共服务", hint: "政府、事业单位、非营利组织" },

  // ── 内容类型：没有行业属性的条目按内容归类 ──
  { id: "学术", hint: "本人的学历教育经历、在校科研、学科竞赛、助教、学生组织与社团" },
  { id: "荣誉", hint: "奖学金、奖项、荣誉称号" },
  { id: "语言", hint: "语言能力与语言证书" },

  // ── 兜底 ──
  { id: "其他", hint: "确实放不进上面任何一类时才用" },
] as const;

/**
 * 类别的字面量联合，由词表推导 —— 不要写成 `string`。
 *
 * 写成 `string` 会让 `isKnownCategory` 变成一个「谎报」的类型守卫
 * （谓词声称能识别子集，实际等于「任何字符串」），于是它的**否定分支**
 * 会把已经确认是 `string` 的值收窄成 `never`，后面一用就报错。
 * 实测被编译器抓过一次。
 */
export type CategoryId = (typeof CATEGORY_DEFS)[number]["id"];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORY_DEFS.map((c) => c.id);

export const isKnownCategory = (value: unknown): value is CategoryId =>
  typeof value === "string" && CATEGORY_IDS.some((id) => id === value);

/** 给 prompt 用的词表文本，顺序固定（可复现性：不能依赖 Object.keys 之类） */
export const renderCategoryVocabulary = (): string =>
  CATEGORY_DEFS.map((c) => `- ${c.id}：${c.hint}`).join("\n");

/**
 * 这个条目的类别需不需要被自动归类写入。
 *
 * 规则一句话：**已经是规范类别的就不动**。空位要填；用户随手写的
 * 「计算机」「数据」这类非规范值要归一化 —— 它们不在词表里，
 * 会让衰减按各人随手写的字符串分组（写「计算机」的和写「互联网」的
 * 其实是同一类，却互相不衰减）。
 */
export const needsCategorizing = (existing: string | undefined): boolean =>
  !isKnownCategory(existing);
