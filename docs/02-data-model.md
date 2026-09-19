# JobLume Resume — 数据模型设计

| 项 | 值 |
|---|---|
| 文档版本 | v1.0 |
| 最后更新 | 2026-09-16 |
| 状态 | 待评审 |
| 前置阅读 | [01-PRD.md](./01-PRD.md) |

---

## 1. 设计目标与约束

### 1.1 两条硬约束

本数据模型被以下约束同时夹逼，所有设计决策都是这两条的折中结果：

| 编号 | 约束 | 来源 |
|---|---|---|
| C2 | **不修改 4 套模板的 section 组件** | 改动成本 = 4 套 × 8 文件 = 32 个文件，不可接受 |
| C3 | **AI 不得编造事实** | 简历造假在求职场景中是致命的 |

> 原有 C1「不修改 `rawproject/` 下任何文件」是开发期对上游只读参考副本的约束。该副本已移除，此条随之失效；编号保留空缺，以免打乱正文对 C2 / C3 的引用。

C2 的具体含义：`ResumeData` 的 **shape 只能扩展，不能重构**。任何需要改变 `Experience` / `Project` 等既有类型字段结构的方案都被否决。

### 1.2 由 C2 推导出的关键架构决策

**决策：数据库层与渲染层彻底分离，通过「物化」单向连接。**

```
CareerProfile ──物化──▶ ResumeData ──渲染──▶ 模板组件（冻结）
   （新，可自由设计）      （shape 冻结）        （不动）
```

`ResumeData` 只增加**两个可选字段**：

```ts
sourceMap?: Record<string, string>;   // itemId → profileEntityId
snapshot?: ResumeSnapshot;            // 生成溯源信息
```

两个都是 `?` 可选，旧数据（无这两个字段）完全不受影响。

---

## 2. 术语表

| 术语 | 英文/代码名 | 定义 |
|---|---|---|
| **职业数据库** | `CareerProfile` | 用户的全部职业信息，全量存储，是唯一事实来源 |
| **条目** | `ProfileEntity` | 数据库中的一条记录，如一段工作经历、一个项目 |
| **板块** | `Section` | 条目的分类容器，如「经历」「项目经验」 |
| **物化** | `materialize()` | 把数据库条目转换为 `ResumeData` shape 的纯函数过程 |
| **简历** | `ResumeData` | 一次生成/编辑的产物，是数据库的一个「视图快照」 |
| **投递目标** | `JobTarget` | 一个具体的岗位，含公司名与 JD 正文 |
| **通用简历** | — | 无 JD 输入，按普适策略生成的简历 |
| **目标简历** | — | 针对某个投递目标生成的简历 |
| **匹配等级** | `MatchLevel` | 二值：`recommended` / `not_recommended`。**由代码从名次推导，不是模型输出的判断** —— 前 N 条即 recommended（见 `validateMatchResult.ts`） |
| **top-N** | `inTopN` | 名次前 N 条。N 默认 `TOP_N = 5`，代表「这份简历放得下几条」，模型只给名次，划线由代码做 |
| **分析结果** | `MatchAnalysis` | LLM 对某个投递目标的一次完整分析，含逐条目等级、理由、证据与覆盖度 |
| **内容指纹** | `contentFingerprint` | 数据库条目内容 + JD 正文的哈希。指纹一致时复用分析结果，保证结果零变化 |
| **来源映射** | `sourceMap` | 简历条目 → 数据库条目的溯源索引 |

---

## 3. 职业数据库数据模型

### 3.1 顶层结构

```ts
// src/types/profile.ts

export interface CareerProfile {
  /** schema 版本，用于未来迁移 */
  version: 1;

  /** 基本信息（复用上游 BasicInfo 类型） */
  basic: BasicInfo;

  /** 全部条目，key 为 entity.id */
  entities: Record<string, ProfileEntity>;

  /** 板块顺序（数据库编辑界面的 Tab 顺序） */
  sectionOrder: string[];

  /** 技能组（独立于 entities，因为结构差异较大） */
  skillGroups: SkillGroup[];

  /** 证书（复用上游 Certificate 类型） */
  certificates: Certificate[];

  /** 自我评价（复用上游富文本字段名） */
  selfEvaluationContent: string;

  /** 元信息 */
  meta: {
    createdAt: string;
    updatedAt: string;
    lastBackupAt: string | null;
  };
}
```

### 3.2 条目类型

```ts
export type EntityType =
  | "education"     // 教育经历
  | "experience"    // 工作/实习经历
  | "project"       // 项目经验
  | "campus"        // 校园经历
  | "honors"        // 荣誉课程
  | "languages"     // 语言能力
  | "custom";       // 用户自建

```

**关于 `Seniority` 的移除**：v1.0 曾定义职级枚举用于「层级匹配」打分维度。改为 LLM 分析后，模型直接从岗位名与 JD 文本中理解职级要求，不需要用户预先标注。该类型已删除。

**关于 `type` 与 `sectionId` 的关系**：`type` 是语义类型（决定字段差异与打分策略），`sectionId` 是它在哪个板块下展示。绝大多数情况两者相同，分开是为了支持「把某个项目也放到校园经历板块下」这类灵活用法。

### 3.3 条目结构

```ts
export interface ProfileEntity {
  id: string;

  /** 语义类型 —— 决定打分策略与字段校验规则 */
  type: EntityType;

  /** 所属板块 —— 决定在数据库编辑界面和简历里的归属 */
  sectionId: string;

  // ─────────── 内容字段（会出现在简历上）───────────

  /** 主标题：公司名 / 学校名 / 项目名 / 荣誉名 */
  title: string;

  /** 副标题：职位 / 专业 / 角色 / 级别 */
  subtitle: string;

  /** 时间范围，格式 `2021.07 - 2024.12` 或 `2021.07 - 至今` */
  dateRange: string;

  /** 描述（Tiptap 富文本 HTML） */
  description: string;

  /** 外链（仅 project 类型使用，对应上游 Project.link） */
  link?: string;
  linkLabel?: string;

  /** 教育经历专用 */
  gpa?: string;
  degree?: string;

  // ─────────── 模型提示字段（不出现在简历上，可选填写）───────────
  //
  // 这些字段在 v2.0 的数据模型中的角色已改变：
  // 它们不再作为本地打分算法的输入（本地方案已废弃），
  // 而是作为 LLM 分析时的补充提示 —— 帮模型更准确地理解条目。
  // 全部为空也能正常工作，模型会直接从 description 中理解。
  //
  // v1 中系统不做自动抽取（原计划的 extractMetrics 已取消）——
  // LLM 分析时直接读 description 即可理解，metrics 由模型在分析结果中
  // 以 matchedSkills / evidence 的形式体现。
  // 这些字段保留给用户想显式强调时使用，全部留空不影响任何功能。

  /**
   * 粗粒度分类标签，如 ['前端', 'B端']。
   * `tags[0]` 兼作**类别**，用于通用简历排序的多样性衰减（见 03 §2.1）。
   * 留空则该条目不参与多样性压制。
   */
  tags: string[];

  /** 具体技能关键词，如 ['React', 'Webpack'] */
  skills: string[];

  /** 量化成果，如 ['构建时间 8min→2min', '复用率 70%'] */
  metrics: string[];

  // ─────────── 元信息 ───────────

  /** 时间范围的可比较形式，用于时效性打分（冗余存储，避免每次解析） */
  endTimestamp?: number;

  /** 是否隐藏（永不进入生成结果） */
  hidden?: boolean;

  /** 排序权重，用于手动置顶/置底 */
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 技能组结构

```ts
export interface SkillGroup {
  id: string;

  /** 技能组名称，如「前端框架」「工程化工具」 */
  name: string;

  /** 展示内容，如「React、Vue.js、Next.js」 */
  content: string;

  order: number;
}
```

**设计说明**：上游把技能存为一个富文本字段 `skillContent`。本项目改为结构化技能组，但**渲染时仍会拼回富文本**写入 `ResumeData.skillContent`，因此模板层无需改动。见 §5.3。

**已决策：不使用熟练度进度条**。技能以纯文本列表呈现，理由见 [01-PRD.md](./01-PRD.md) FR-DB-03。

**技能名的识别交给 LLM，不做本地抽取**：

本地正则抽取需要维护一份技能词典，且无法处理「熟悉 SSR 与同构渲染」这类表述 —— 而 LLM 能直接理解。因此技能组**不含标签字段**，`content` 原文直接进 prompt。

**这消除了一个维护负担**：不需要 `skillDictionary.ts`（原计划 350 行）。

### 3.5 板块定义

```ts
export interface SectionDef {
  id: string;
  title: string;
  icon: string;

  /** 必备板块在生成简历时默认勾选且不可取消 */
  required: boolean;

  /** 是否由系统预设（预设板块不可删除，只能停用） */
  preset: boolean;

  /** 该板块接受的条目类型 */
  accepts: EntityType[];
}

export const SECTION_DEFS: SectionDef[] = [
  { id: "basic",        title: "基本信息",  icon: "👤", required: true,  preset: true, accepts: [] },
  { id: "education",    title: "教育经历",  icon: "🎓", required: true,  preset: true, accepts: ["education"] },
  { id: "experience",   title: "经历",      icon: "💼", required: true,  preset: true, accepts: ["experience"] },
  { id: "skills",       title: "技能",      icon: "⚡", required: true,  preset: true, accepts: [] },
  { id: "certificates", title: "证书",      icon: "🏆", required: true,  preset: true, accepts: [] },
  { id: "projects",     title: "项目经验",  icon: "🚀", required: false, preset: true, accepts: ["project"] },
  { id: "selfEvaluation", title: "自我评价", icon: "💬", required: false, preset: true, accepts: [] },
  { id: "campus",       title: "校园经历",  icon: "🏫", required: false, preset: true, accepts: ["campus"] },
  { id: "honors",       title: "荣誉课程",  icon: "🎖️", required: false, preset: true, accepts: ["honors"] },
  { id: "languages",    title: "语言能力",  icon: "🌐", required: false, preset: true, accepts: ["languages"] },
];
```

**`sectionId` 常量必须与 `ResumeData` 的板块 id 完全一致** —— 这是数据库与渲染层能对接的前提。统一在 `src/config/sectionIds.ts` 中定义为常量，两边都从这里引用。

---

## 4. 简历层数据模型（对上游的扩展）

### 4.1 扩展字段

对 `ResumeData` 只做加法：

```ts
// src/types/resume.ts  —— 在原有接口上追加

export interface ResumeData {
  // ... 上游全部字段保持不变 ...

  /** 来源映射：itemId → profileEntityId。用于溯源与回写 */
  sourceMap?: Record<string, string>;

  /** 生成快照：记录这份简历是怎么来的 */
  snapshot?: ResumeSnapshot;
}

export interface ResumeSnapshot {
  /** 生成模式 */
  mode: "generic" | "targeted" | "manual";

  /** 关联的投递目标（通用简历为 null） */
  jobTargetId: string | null;

  /** JD 正文快照 —— 防止投递目标被修改后无法追溯 */
  jdSnapshot?: string;

  /**
   * 生成时使用的分析结果快照。
   * 直接拷贝 JobTarget.matchAnalysis，使简历可独立回溯
   * 「当时是根据什么判断选的这些内容」，即使投递目标后来被改动或删除。
   */
  matchAnalysisSnapshot?: MatchAnalysis;

  /** 各板块选中的条目 id */
  selectedEntityIds?: Record<string, string[]>;

  /**
   * 生成这份简历的用户（`currentUserId`）。
   *
   * 多用户下用于溯源：这份简历的 `selectedEntityIds` / `sourceMap` 指向的是
   * **哪个人的**经历。可选项 —— 改造前生成的简历没有它。
   */
  profileId?: string;

  /** 生成时间 */
  generatedAt: string;
}
```

### 4.2 兼容性

| 场景 | 行为 |
|---|---|
| 读取旧简历（无 `sourceMap` / `snapshot`） | 正常渲染，编辑功能不受影响。溯源面板显示「此简历为早期版本，无来源信息」 |
| 写回 localStorage | `zustand/persist` 自动序列化新字段，无需迁移脚本 |
| 导出 JSON | 新字段一并导出；旧版本导入时忽略未知字段 |
| 版本号 | 不需要 bump —— 两个字段都是可选，不影响既有结构 |

---

## 5. 物化层设计

### 5.1 职责

物化（materialize）是**纯函数**，把数据库条目转换为 `ResumeData` 的 shape。它不读全局状态、不发起网络请求、不依赖时间（时间戳由调用方传入）。

```ts
// src/lib/profile/materialize.ts

export interface MaterializeInput {
  profile: CareerProfile;
  /** 各板块选中的条目 id；未列出的板块使用默认策略 */
  selection: Record<string, string[]>;
  /** 选中的板块及其顺序 */
  sections: Array<{ id: string; title: string; enabled: boolean; order: number }>;
  /** 模板与样式（来自用户选择或上次的简历设置） */
  templateId: string | null;
  globalSettings?: Partial<GlobalSettings>;
  /** 溯源信息 */
  snapshot?: ResumeSnapshot;
}

export function materialize(input: MaterializeInput): ResumeData;
```

### 5.2 字段映射表

| `ResumeData` 字段 | 来源 | 转换规则 |
|---|---|---|
| `basic` | `profile.basic` | 直接拷贝 |
| `education[]` | `entities[type=education]` | `{id, school: title, major: subtitle, degree, startDate, endDate, gpa, description, visible}` |
| `experience[]` | `entities[type=experience]` | `{id, company: title, position: subtitle, date: dateRange, details: description, visible}` |
| `projects[]` | `entities[type=project]` | `{id, name: title, role: subtitle, date: dateRange, description, visible, link, linkLabel}` |
| `certificates[]` | `profile.certificates` | 直接拷贝 |
| `customData[sectionId]` | `entities[sectionId=campus/honors/languages]` | `{id, title, subtitle, dateRange, description, visible}` |
| `skillContent` | `profile.skillGroups` | 渲染为富文本 HTML，见 §5.3 |
| `selfEvaluationContent` | `profile.selfEvaluationContent` | 直接拷贝 |
| `menuSections` | `input.sections` | 转换为 `MenuSection[]` |
| `globalSettings` | `input.globalSettings` | 合并默认值 |
| `sourceMap` | 全部条目 | `{itemId: entityId}` |
| `snapshot` | `input.snapshot` | 直接拷贝 |

### 5.3 技能组 → 富文本的渲染

物化时必须把结构化技能组拼回上游期望的 HTML：

```html
<div class="skill-content">
  <ul>
    <li>前端框架：React、Vue.js、Next.js</li>
    <li>工程化工具：Webpack、Vite、Rollup</li>
  </ul>
</div>
```

**渲染规则**：
- 每组一个 `<li>`，格式 `{name}：{content}`
- 组内 `content` 原样输出，不重新切分
- 组的顺序按 `order` 排序
- 若某组 `content` 为空则跳过该组

**约束**：生成的 HTML 结构必须与上游 `initialResumeData.ts` 中的 `skillContent` 示例一致（`div.skill-content > ul > li`），否则 4 套模板中的 `SkillSection` 组件的样式会失效。

### 5.4 自定义板块的落位

`campus` / `honors` / `languages` 三个板块写入 `customData[sectionId]`。这依赖上游模板的通用回退分支：

```tsx
// src/components/templates/classic/index.tsx:48
default:
  if (sectionId in data.customData) {
    return <CustomSection title={sectionTitle} sectionId={sectionId} items={data.customData[sectionId]} />;
  }
  return null;
```

**已验证**：4 套模板（classic / modern / left-right / timeline）的 `index.tsx` 中均存在此分支。

> 2026-09-19 复核：模板从 9 套精简到 4 套后重新逐套确认，仍然全部存在此分支。因此新增这三个板块**不需要修改任何模板文件**。

**同时必须满足的前置条件**：`menuSections` 中必须存在对应 `id` 的条目且 `enabled: true`，否则 `enabledSections` 过滤后不会进入渲染循环。

---

## 6. 投递目标数据模型

```ts
// src/types/jobTarget.ts

export interface JobTarget {
  id: string;

  /** 公司名（用户填写） */
  company: string;

  /** 岗位名（用户填写） */
  position: string;

  /** JD 正文原文 —— 不做预解析，原样保留作为 LLM 分析的输入 */
  jdRaw: string;

  /** 用户备注 */
  note?: string;

  /** 最近一次 LLM 分析结果；未分析过则为 null */
  matchAnalysis: MatchAnalysis | null;

  /** 分析缓存信息；未分析过则为 null */
  analysisCache: AnalysisCache | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * 匹配等级。**二值制**：AI 只回答「推不推荐」，不做程度分档。
 *
 * 设计意图：AI 是推荐者不是决策者。它只负责从经历池里翻出值得放的内容，
 * 最终放哪些由用户勾选决定。等级越少，判断越稳定，用户也越容易理解。
 *
 * 不使用 0-100 分，理由见 03-generation-algorithm.md §4.1。
 * 后续若两档不够用（如推荐条目多于版面容量），可扩展为三档，
 * 只需在联合类型中增加成员 —— 调用方按枚举处理，无需改动。
 */
export type MatchLevel = "recommended" | "not_recommended";

export interface MatchAnalysis {
  /** 逐条目的分析结果，key 为 entityId */
  items: Record<string, MatchItemResult>;

  /**
   * LLM 返回的条目顺序（即推荐强度降序）。
   * 保存它是为了让 top-N 的计算可复现 —— 从 items 这个 Record 里
   * 无法恢复顺序，而 Record 的键序在 JS 中是不可靠的。
   */
  rankedIds: string[];

  /** 本次的 top-N 设定值 */
  topN: number;

  /** 整体覆盖度分析 */
  summary: {
    /** 判定为推荐的条目数 */
    recommendedCount: number;
    coverage: {
      /** JD 要求且数据库中有支撑的技能 */
      covered: string[];
      /** JD 要求但支撑薄弱的技能 */
      weak: string[];
      /** JD 要求但数据库中没有的技能 —— 只报告，不伪造 */
      missing: string[];
    };
    /** 整体建议 */
    advice: string;
  };

  // ─────────── 溯源信息 ───────────

  /** 使用的模型标识 */
  modelId: string;

  /** 提示词模板版本 */
  promptVersion: string;

  /** 分析时间 */
  analyzedAt: string;
}

export interface MatchItemResult {
  level: MatchLevel;

  /** 判断依据，一句话 */
  reason: string;

  /**
   * 逐字引用条目描述中的原文。
   * level 为 `not_recommended` 时必填，且必须能在 description 中找到；
   * 否则由 validateMatchResult() 自动提升为 `recommended`（无法举证就不该否定）。
   */
  evidence: string;

  /** 从该条目中提取的、与 JD 相关的技能 */
  matchedSkills: string[];

  /** JD 要求但该条目未体现的技能 */
  missingSkills: string[];

  /** 建议突出的内容，用于后续改写环节 */
  suggestedFocus?: string;

  /**
   * 是否入选「最推荐的 N 条」。
   * 由 LLM 返回数组的顺序决定（数组顺序即推荐强度），取前 N 条。
   * 仅作优先级提示，不影响用户看到的排序 —— 用户看到的排序始终是「板块 + 时间」。
   */
  inTopN: boolean;

  /**
   * 该条目支撑了哪几条要求（引用 `Requirement.id`）。
   * 与 `requirements[].entityIds` 是同一个关系的两个方向，校验时会丢弃不存在的 id。
   */
  requirementIds: string[];
}

/**
 * 分析缓存。
 * 指纹一致时直接复用 matchAnalysis，不重新调用模型 —— 这是可复现性的第四道防线。
 */
export interface AnalysisCache {
  /** 数据库全部条目内容 + JD 正文 的哈希 */
  contentFingerprint: string;

  /** 模型标识，换模型必然改变结果 */
  modelId: string;

  /** 提示词模板版本，模板改动必须使缓存失效 */
  promptVersion: string;

  /** 分析时间 */
  analyzedAt: string;
}
```

**关于 `MatchLevel` 为什么只有两档、为什么不用 0-100 分**：

| 设计选择 | 理由 |
|---|---|
| 只有两档 | AI 是**推荐者**不是决策者 —— 它只回答「这条值不值得放」，最终放哪些由用户勾选决定。档位越少，判断越稳定，用户也越容易理解 |
| 不用 0-100 分 | 分数制造精确性错觉（87 分和 91 分的差别说不清），且分数的小幅波动会直接改变排序，把模型的不确定性放大成用户可见的差异 |
| 单设 `inTopN` 而非增加档位 | 「推荐条目多于版面容量」是**排序问题**不是**程度问题**。用独立的布尔标记表达优先级，比增加一个模糊的中间档更清晰 |

详见 [03-generation-algorithm.md](./03-generation-algorithm.md) §4.1。

**关于 `evidence` 字段的存在意义**：它把「请保守判断」这类模糊的提示词倾向，替换成程序可验证的硬约束。模型必须引用原文才能给出极端评级，引用不出就自动降级。这既提升了稳定性，也让用户可以自己核对判断是否成立。

---

## 7. Store 结构

### 7.1 三个独立 store

| Store | 持久化 key | 内容 | 是否已有 |
|---|---|---|---|
| `useCareerProfileStore` | `career-profile-storage` | `{ profiles: Record<userId, CareerProfile>, currentUserId }` | 新建 |
| `useResumeStore` | `resume-storage` | `{ byUser: Record<userId, Record<resumeId, ResumeData>>, activeByUser }` | 扩展 |
| `useJobTargetStore` | `job-target-storage` | `{ targetsByUser: Record<userId, Record<targetId, JobTarget>> }` | 新建 |

**为什么拆三个 store**：`CareerProfile` 的数据量远大于单份简历，混在一个 store 里会导致任何一处修改都触发全量持久化。拆分后各自的持久化互不干扰。

**用户维度（D30，岗位部分已被 D34 取代）**：职业档案、简历、投递目标三样都按
`userId` 分桶；`currentUserId` 存在档案 store 里（用户就是一份档案，不另设用户
记录）。D30 当时让岗位本身保持全局共享、只有分析按人分（`analysesByUser`），
**D34 又改成了岗位本身也跟随用户** —— 于是那层索引失去意义，分析塌回单槽
`matchAnalysis`。这是简化：一层结构，前提没了就该没。

三样都带 `version` + `migrate` + `merge`，迁移把存量数据归到固定字面量
`LEGACY_USER_ID` 名下（**不生成随机 id**：三个 store 各自独立迁移、没有协调者，
各生成一个 id 会让简历挂在一个档案不认识的用户名下）。两条必须守住的规则：
`migrate` 遇坏输入**抛错**而不是返回空结构（抛错不写盘，返回空结构会把空数据
当成迁移结果提交），且必须**同步**（异步会让 persist 解构一个未 await 的 Promise）。
版本号：档案与简历是 `1`，投递目标是 `2`（它多走过一次 v1→v2 的扇出）。

**磁盘副本（D35）**：三份状态还会防抖 1.5s 镜像一份到 `<仓库根>/saves/<userId>/`
（`profile.json` / `resumes/<id>.json` / `jds/<id>.json`）。**单向** —— 只从浏览器
流向磁盘。接线在 `hooks/useSavesMirror.ts`，差分是纯函数在 `lib/saves/mirror.ts`；
写入端点与安全边界见 README 的「数据存在哪里」。

### 7.2 事件契约

三个 store 之间**基本**不互相 import，通过**显式传参**连接：

```ts
// 生成目标简历时，由 UI 层协调
const profile = useCareerProfileStore.getState().profile;
const target  = useJobTargetStore.getState().targets[targetId];

// 1. 取分析结果：指纹命中则复用，否则调用 LLM
const analysis = await getOrCreateAnalysis({ profile, target });

// 2. 用户确认后得到选中集合（含手动调整）
const selection = resolveSelection({ analysis, userAdjustments });

// 3. 物化
const resume = materialize({
  profile,
  selection,
  sections,
  snapshot: { mode: "targeted", jobTargetId: target.id, matchAnalysisSnapshot: analysis },
});
useResumeStore.getState().addResume(resume);
```

**唯一例外**：`useResumeStore` 内部为了维护 `sourceMap` 的一致性，需要在 `updateResume` 时读取 `sourceMap` —— 但这是读自身状态，不构成跨 store 依赖。

#### 刻意的例外：简历 / 投递目标 → 档案 store

简历 store 与投递目标 store 都会 `import` 档案 store，读 `getState().currentUserId`
来定位「当前用户的那一份」。上面那条约定在这里**刻意破例**，理由是：

- 这条依赖**真实存在** —— 简历本来就属于某个人，藏起来不如写出来
- 它是**单向无环**的：档案 store 不反向依赖简历 store（也不需要，它不必知道简历存在）
- 替代方案都更差：让 33 个调用点各自传 `userId`（改动面 33 个文件、收益为零）；
  或在简历 store 里镜像一份 `currentUserId`（多一份真相 + 多一个同步点）

配套两条保障：**写入统一走 store 内部包装过的 `set`**，由它把当前用户的切片镜像回
`byUser` / `targetsByUser`（两边的 action 体因此一个字没改）；**切用户靠模块级订阅**
档案 store，而不是让每个切人入口自己记得调 —— 切人有「选卡」「新建」等入口，订阅让
「忘记同步」在结构上不可能发生。

两处收口有一处**有意的差别**：简历那边没有当前用户时会放行去写别名，投递目标那边
整个 no-op。放行会写进一个 `merge` 时被抹掉的分片（界面上看得到、刷新就没了），
岗位 v2 起必须属于某个人，所以按档案 store `put()` 的纪律直接不写。

### 7.3 分析结果的所有权

`MatchAnalysis` 存在 `JobTarget` 上，**不在简历上**。但简历通过 `snapshot.matchAnalysisSnapshot` 持有一份拷贝。

| 场景 | 行为 |
|---|---|
| 投递目标被删除 | 其下简历仍保有 `matchAnalysisSnapshot`，可回溯「当时为什么这么选」 |
| 投递目标被修改并重新分析 | 已生成的简历不受影响，其快照不变 |
| 用户查看历史简历的匹配依据 | 读 `snapshot.matchAnalysisSnapshot`，不读 `JobTarget.matchAnalysis` |

**为什么拷贝而不是引用**：简历是某一时刻的产物，必须能独立地回答「我当时依据什么做的决定」。引用会被后续修改污染。

### 7.4 图片存储迁移

**问题**：上游把照片（`basic.photo`）和证书（`Certificate.url`）存为 Base64 字符串，放在 localStorage。localStorage 配额约 5MB，2-3 张证书图片即可撑满。

**方案**：新增 `src/lib/imageStore.ts`，把图片二进制存入 IndexedDB，localStorage 中只保留引用：

```
IndexedDB: ImageStore
  key: `img_${uuid}`
  value: Blob

localStorage 中的引用形式: `idb:img_xxxxxxxx`
```

**物化与渲染时的解析**：渲染前把 `idb:` 引用解析为 `blob:` URL 并注入。这一步在上游的 `optimizeImages` / `bakeObjectFitCoverImages`（`src/utils/export.ts`）之前完成，保证导出不受影响。

**兼容**：非 `idb:` 前缀的值（旧数据、外链 URL）原样透传。

---

## 8. 数据流全景

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 录入阶段                                                  │
│    用户 → 职业数据库编辑界面 → useCareerProfileStore          │
│    （PDF 导入 → 解析 → 逐条确认 → 落库）                       │
│    （tags / skills / metrics 由 extract*() 自动填充，可编辑）  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 2. 选择阶段                                                  │
│                                                              │
│  通用组合                      LLM 智能匹配                   │
│  ┌────────────────┐          ┌──────────────────────────┐   │
│  │ scoreGeneric   │          │ 指纹命中？                │   │
│  │ 确定性排序      │          │  ├─ 命中 → 复用缓存结果    │   │
│  └───────┬────────┘          │  └─ 未命中 ↓              │   │
│          │                   │  buildMatchPrompt()      │   │
│          │                   │         ↓                │   │
│          │                   │    LLM 分析（temp=0）     │   │
│          │                   │         ↓                │   │
│          │                   │  validateMatchResult()   │   │
│          │                   │         ↓                │   │
│          │                   │ 二值推荐 + top-N + 理由    │   │
│          │                   └────────────┬─────────────┘   │
│          │                                │                 │
│          └────────────┬───────────────────┘                 │
│                       ▼                                     │
│              候选清单（用户确认/调整）                        │
│              ↓ 失败或无 Key 时降级为纯手动选择                │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 3. 物化阶段                                                  │
│    materialize() → ResumeData (+ sourceMap + snapshot)       │
│    （不含 AI 改写；改写能力规划在后续版本）                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 4. 编辑与输出                                                │
│    useResumeStore → 工作台编辑 → 模板渲染 → 导出              │
│    （sourceMap 支撑「同步回数据库」）                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. 关键设计决策记录

| 编号 | 决策 | 备选方案 | 选择理由 |
|---|---|---|---|
| D1 | 数据库与渲染层彻底分离，通过物化连接 | 直接改造 `Experience` 等类型加匹配字段 | 备选方案需改 4 套模板 × 8 文件 = 32 个文件 |
| D2 | `sourceMap` 存在简历上而非数据库上 | 数据库记录「被哪些简历引用」 | 简历知道自己的来源更自然；删除简历不必回写数据库 |
| D3 | 自定义板块走 `customData` 通道 | 为每个板块新建类型 + section 组件 | 上游已有通用回退分支，零模板改动 |
| D4 | 三个独立 store | 单个 store | 数据量差异大，拆分后持久化互不干扰 |
| D5 | 图片迁 IndexedDB | 继续用 localStorage | localStorage 5MB 配额会被 Base64 图片撑爆 |
| D6 | 打分以本地规则为主、AI 为辅 | 纯 AI 打分 | 纯 AI 不可复现、成本高、无 Key 时功能不可用 |
| D7 | 匹配字段（tags/skills/metrics）与内容字段分离 | 从描述文本中抽取 | 抽取不可靠；显式字段让用户可控、打分可解释 |
| D8 | 技能用纯文本列表，不用熟练度进度条 | 保留上游的 `Skill { name, level }` | 熟练度是主观自评，展示显浮夸、作权重会压窄候选集 |
| D9 | ~~`skillTags` 不持久化，物化时现算~~ —— v3.0 已整体删除该字段 | 存进数据库 | 派生值持久化会产生与 `content` 不一致的风险；但更根本的是该字段无人使用（D26） |
| D10 | 编辑简历默认不写回数据库 | 默认回写 / 逐项勾选 | 「给这家公司换个说法」是高频需求，默认回写会让它变得不可能 |
| D11 | 同一投递目标重新生成时新建版本 | 覆盖同一份 | 调参重试是常态，需要保留可对比的版本；JSON 体积小，存储无压力 |
| D12 | 匹配改为纯 LLM 语义分析，废弃确定性打分 | 「5 维加权打分 + AI 微调」 | 打分依赖用户手填标签，录入成本高且标签是内容的劣质代理。LLM 能直接理解语义关联（如「React Native 属于跨端」），这是标签匹配做不到的 |
| D13 | ~~LLM 输出二值判断~~ → **模型只输出名次**，「推荐/不推荐」由代码按 top-N 推导 | 分数 + 排序 | 分数的小幅波动会直接改变排序，把模型的微小不确定性放大成用户可见差异。二值判断有天然缓冲，且档位越少越稳定 |
| D19 | AI 是推荐者不是决策者，勾选状态完全由用户产生 | AI 预设默认勾选 | AI 一旦预设勾选，用户会直接确认而不逐条审视，等于把决策权偷偷交回给 AI。留空强制用户过一遍 |
| D20 | ~~只有 `not_recommended` 需要举证~~ → **已撤销**：模型不再做否定判断，举证机制随之取消 | 推荐与不推荐都要举证 | 当时：举证责任在否定一侧，无法举证就不该否定用户的经历。后续：模型只排序、不判定，没有「否定」这个动作需要举证 |
| D21 | 锁定 DeepSeek 单一模型 | 保留 4 家 Provider 可选 | 稳定性验收需要针对具体模型实测，锁定一个模型才能给出有意义的阈值。**后续收紧**：不只是「v1 锁定」—— 上游那 4 家配置已整体移除，只留 DeepSeek 单通道 |
| D22 | ~~「推荐但未入选 top-N」同样算推荐~~ → **已撤销**：`level` 现由名次推导，top-N 之外即 `not_recommended` | 只有 top-N 才算推荐 | 当时：多推荐让用户删优于少推荐让用户漏。后续：模型只给名次，划线交给代码，二者不再分离 |
| D23 | 目标简历模式下勾选超出页数时**不自动删减** | 自动按优先级删到一页 | 勾选是用户的决定，系统不替用户删。只提示超出并提供需用户点击的「仅保留 ★」操作 |
| D24 | ~~通用简历排序 = 时效分 × 同类衰减~~ → **已撤销** | 纯时效排序 / 三因子加权 | 当初：纯时效会让「近期全是金融」的简历全是金融，失去通用性，衰减用单一参数 λ 表达、语义可验证。撤销：产品收缩为「AI 只判定，不动你的文字」后勾选完全由用户产生，再叠自动排序等于替用户改主意。现为全选 + 数据库顺序，见 [03](./03-generation-algorithm.md) §2.1 |
| D25 | 删除 `MatchProvider` 接口与 `aiClient.ts` 抽象层 | 预留接口"为后续扩展" | 一个接口、一个实现、一个调用方。等真的有第二个实现时再抽 |
| D26 | 删除 `SkillGroup.skillTags` 与 `ProfileEntity.qualityScore` | 保留字段"备用" | 死数据。系统不填、算法不读、用户不会填 |
| D27 | ~~`selectEntities` 约束求解器降级为排序函数~~ → 该函数与其并入的 `rankGeneric` 均已删除 | 保留约束求解 + 多样性修正 | 当时：手动作选后没有「求解」可言，只剩排序。**后续**：那层排序也不做了 —— 通用简历改为全选 + 数据库顺序（见 [03](./03-generation-algorithm.md) §2.1） |
| D28 | **「该不该投」与「放哪几条」分成两处**：投递目标页只做 JD 分析（只读），选择与生成搬到「我的简历 → 生成岗位专用简历」 | 分析页同时承担选择与生成 | 两者混在一屏时，用户会在还没判断要不要投的时候就被要求挑条目；而且分析视图会因此长出「支撑这条要求但你本次没勾选。加入」这类只在同屏时才讲得通的交互。分开后投递目标页是**纯只读**的岗位判断，选择发生在它自己的流程里 |
| D29 | **适配度等级由 `requirements[]` 推导，不写进 `MatchAnalysis`** | 存进 `summary` / 让模型给 | 模型给不了 —— 它的入参里根本没有简历选择信息。存进 `summary` 则要为旧数据写兼容分支，而 `requirementsOf()` 已经会在渲染时替旧数据从 `coverage` 重建，现算因此天然覆盖新旧。另有 `entityIds` 非空才算「有支撑」：`legacyRequirements` 反推出来的旧数据是 `covered` + 无指向，不加这条它能一路够到「匹配度高」 |
| D14 | ~~LLM 不做排序~~ —— v3.2 起：**有 JD 的目标简历用 AI 的 `rankedIds` 排内部顺序**，无 JD 的通用简历用数据库顺序 | 按 LLM 输出顺序排列 / 板块+时间 | 当初的顾虑是不稳定的是相对排序而非绝对判断。v3.2 改变判断：AI 排序只用于目标简历，且 `temperature=0` + 指纹缓存兜底；通用简历仍不排序 |
| D15 | 用指纹缓存让数据未变时结果零变化 | 每次生成都重跑 | 用户接受「低频率不可复现」，但缓存能做到更好：数据没变就不重跑。这把「低频」压到了「零频」 |
| D16 | 用 `evidence` 硬字段替代「请保守判断」的软提示 | 提示词中写「宁可少推荐」 | 模糊标准会放大不稳定性 —— 模型每次对「多保守」的理解略有不同，边界条目来回横跳。要求逐字引用原文是可程序验证的硬约束 |
| D17 | `tags` / `skills` / `metrics` 从打分输入降级为模型提示 | 保持为打分的必填字段 | LLM 直接读描述即可理解，不需要用户预先做「内容 → 标签」的翻译。字段保留但可空；`skills`/`metrics` 改由 LLM 在归类与匹配时填充（本地正则抽取的 `extractMetrics` / `extractSkillTags` 已删除） |
| D18 | JD 不做预解析，原文直传模型 | 本地规则 + AI 结构化解析 | 预解析引入一层信息损失。JD 原文中的「团队正在做…」等上下文对理解岗位真实需求很重要，直接给原文质量更高，且少一个组件 |
| D30 | **用户维度**：职业档案、简历、岗位分析都按 `userId` 分桶；投递目标**本身**保持全局共享 | 全站单一隐式「我」 / 岗位也按用户隔离 | 要替家人朋友各维护一份材料。岗位必须共享（多人可投同一岗），但「这条要求由哪几段经历支撑」只对某一个人成立 —— 分析不隔离会让 B 看到用 A 的经历支撑的「你具备」。**一个用户 = 一份职业档案**，不另设用户记录：名字与证件照只存一处，不可能出现「用户名张三、档案里李四」 |
| D31 | **迁移的两条硬规则**：`migrate` 遇坏输入**抛错**、且必须**同步** | 返回空结构 / 允许异步 | 抛错会跳过 merge/set/setItem，磁盘原封不动、只弹提示；返回空结构反而会被当成迁移结果提交并写盘。异步则更凶：persist 从不 await `migrate` 的返回值，会把 pending Promise 交给 `merge` 展成空对象，然后因为 `migrated === true` **立刻把空状态写盘** —— 静默全量清空 |
| D32 | **简历 store 单向 import 档案 store**（§7.2 的刻意例外） | 严格互不 import | 见 §7.2 的例外说明。核心权衡：这条依赖真实存在且无环，而「33 个调用点各传 `userId`」改动面大、收益为零 |
| D33 | **备份的归属字段是纯提示，不参与逻辑** | 用姓名做归属校验/匹配 | 姓名会重复、会改，拿它判定只会制造新的错误来源。它的唯一职责是让用户在导入前看到「这份是谁的、要写进谁名下」—— 多用户下最容易静默出错的一步。老备份没有这个字段也必须照常能读 |
| D34 | **投递目标也完全按用户隔离**（取代码 D30 里「岗位本身保持全局共享」那一半）：`targets` 改成 `targetsByUser[userId][targetId]`，`JobTarget` 上的 `analysesByUser` / `cachesByUser` 塌回单槽 `matchAnalysis` / `analysisCache` | 维持 D30 的「岗位共享、分析各人分」 | 用 saves/ 做本地存档时，「JD 跟随用户走」比「多人共投一个岗位」更贴合真实用法 —— 一个人替家人朋友各投各的，不是几个人抢同一个岗位。连带后果是一层结构被删掉而不是又加一层：v1 那层 `analysesByUser` 存在的唯一理由就是「岗位共享但分析不共享」，前提没了，层也就该没了。**代价（已知边界）**：v1 存量数据里「没有任何人分析过」的岗位无法判断归属，只能归到 `LEGACY_USER_ID`，而在已经有多用户档案的安装里这个名字很可能没有对应档案 → 那些岗位还在盘上但界面上够不着。影响面局限于「v1 的盘 + 多个真实用户」这一种情况 |
| D35 | **`saves/<userId>/` 是单向镜像**：浏览器 localStorage 仍是真相源，改动防抖 1.5s 写一份到磁盘；磁盘上改的不会被读回来 | 用 saves/ 当真相源（双向同步） | 双向同步要处理冲突合并，而这是单人本地工具，收益远小于复杂度。单向的话最坏情况只是「镜像落后」或「手改被覆盖」，不会丢数据。**已知边界**：删用户不会删掉 `saves/` 下对应目录 —— 服务端只做单文件读写，递归删除的破坏面比写文件大得多 |

---

## 10. 已关闭的待确认事项

| 编号 | 事项 | 决定 | 影响 |
|---|---|---|---|
| Q1 | `endTimestamp` 冗余存储 vs 每次解析 | **冗余存储**（写入时解析一次） | 排序是高频操作，写入是低频操作。解析正则不应出现在热路径上。此外 §4.2 要求 prompt 构造逐字节确定，运行时调用 `Date.now()` 会破坏这一点 |
| Q2 | 技能是否保留熟练度进度条 | **不使用进度条**，纯文本列表 | 见 D8；技能编辑 UI 简化为「组名 + 内容文本 + 可选标签」 |
| Q3 | 删除数据库条目时，引用它的历史简历如何处理 | **不动历史简历**，仅标记 `sourceMap` 为失效引用 | 历史简历是已投递的产物，不应因数据库变动而变化。失效引用在「同步回数据库」时提示用户「来源已删除」 |
| Q4 | 分析结果存在投递目标上还是简历上 | **两处都存**：`JobTarget.matchAnalysis` 是当前结果，简历的 `snapshot.matchAnalysisSnapshot` 是生成时的拷贝 | 见 §7.3。引用会被后续修改污染，历史简历必须能独立回答「当时依据什么做的决定」 |
| Q5 | 数据变更后自动重新分析还是提示用户 | **提示，不自动重跑** | 自动重跑会消耗额度，且让结果在用户没注意时变化。确定性是用户明确要求的 |

### Q3 的详细说明

删除数据库条目 `e5` 后，引用了它的历史简历：

| 简历中的条目 | `sourceMap` | 行为 |
|---|---|---|
| 内容仍在 | `{ itemId: "e5" }` | 正常渲染。点击「同步回数据库」时提示「来源条目已删除，是否重新创建？」 |
| 内容仍在 | 无对应条目 | 视为简历独有内容，正常渲染，「同步回数据库」按钮显示为「添加到数据库」 |

**核心原则**：删数据库不等于删简历。简历是某一时刻的快照，用户投出去的版本必须保持原样可追溯。
