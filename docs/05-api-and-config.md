# JobLume Resume — API 与配置

| 项 | 值 |
|---|---|
| 文档版本 | v1.0 |
| 最后更新 | 2026-09-16 |
| 状态 | 待评审 |
| 前置阅读 | [02-data-model.md](./02-data-model.md)、[03-generation-algorithm.md](./03-generation-algorithm.md) |

---

## 1. AI 配置

### 1.1 只保留 DeepSeek 一条通道

**已决策：本项目只使用 DeepSeek 一个模型。**

上游曾支持豆包 / OpenAI 兼容 / Gemini 共 4 家。四条通道各自要维护一套请求头、错误格式与前端表单，而实际只用到一条 —— 已全部移除。所以 `src/config/ai.ts` 里不再有「服务商」这个概念：**端点固定，模型名可调**。

| 项 | 值 |
|---|---|
| `modelType` | `deepseek`（唯一取值） |
| 默认模型 | `deepseek-chat` |
| `temperature` | `0` |
| `seed` | `42`（配合 `temperature=0` 进一步降低波动） |
| 需要用户配置 | 仅 API Key（Endpoint 有内置默认值，模型 ID 可留空） |
| 稳定性验收 | **只针对 DeepSeek 实测** |

`deepseek-chat` 同时具备识图能力，PDF 简历导入走它，因此不需要单独的视觉模型。

### 1.2 配置存储

```ts
// src/store/useAIConfigStore.ts
{
  deepseekApiKey: string,
  deepseekModelId: string,   // 留空则用 src/config/ai.ts 的 DEFAULT_MODEL
}
```

持久化 key：`ai-config-storage`（localStorage）。老用户已存的 DeepSeek Key 不受影响；其余服务商的历史 Key 会留在 localStorage 里不再被读取，无害。

### 1.3 降级判定

```ts
useAIConfigStore.getState().isConfigured(): boolean   // deepseekApiKey 非空即为 true
```

**所有 AI 功能入口都必须先检查此函数。** 未配置时：

| 功能 | 降级行为 |
|---|---|
| LLM 智能匹配 | 候选清单**照常渲染**，只是不显示推荐标注 |
| 简历导入解析 | 不可用（该功能强依赖 AI），提示用户先配置 |

**降级在本设计里非常简单**：生成路径自始至终是「用户勾选 → 物化」，与 AI 无关。AI 不可用只意味着少一层推荐标注，不需要切换模式、不需要备用算法。

**实现上**：`analysis === null` 时 UI 不渲染标注区块即可。不存在「手动模式」这个独立状态。

**无标注时不得沿用上次结果**：若某次分析失败但 `JobTarget.matchAnalysis` 还留着旧数据，必须按指纹判断是否过期；过期则不渲染标注，避免用户误以为是当前数据下的结论。

---

## 2. 新增 API 路由

### 2.1 路由总表

| 路由 | 方法 | 用途 | 来源 |
|---|---|---|---|
| `/api/match` | POST | LLM 推荐标注分析 | 本项目新增 |
| `/api/tag` | POST | 经历自动归类（与 `/api/match` 共用处理器，只换 prompt） | 本项目新增 |
| `/api/saves` | POST | 把一份数据镜像到 `saves/<userId>/` | 本项目新增 |
| `/api/saves` | DELETE | 删掉 `saves/<userId>/` 下的一份存档 | 本项目新增 |

> 上游的 `/api/polish`（段落润色）与 `/api/grammar`（语法检查）本项目从未调用，且改写类 AI 已按产品决策移除（「AI 只判定，不动你的文字」，见提交 `7168adf`），两条路由已删除。`/api/resume-import`（PDF 解析）与 `/api/proxy/image`（图片代理）后来也一并删掉了 —— 前者由客户端自己解析，后者随简历导入功能的下线失去调用方。

> ⚠️ **`/api/saves` 是本项目唯一按请求往磁盘写文件的端点，且既不需要认证也不在限流之内
> （限流只挂在 `/api/match`、`/api/tag` 上）。** 它只写 `saves/` 之下，路径片段由
> `lib/server/saves.ts` 的白名单校验。**部署到公网前必须关掉** —— 那等于对外开一个
> 文件写入面。理由与三层防护见该文件头注释与 README。

### 2.2 通用请求约定

所有 AI 路由遵循同一套约定：

```ts
// 请求体公共字段
{
  apiKey: string;           // 用户 API Key，由客户端传入
  model: string;            // 模型 ID，留空则用服务端默认
  // ... 各路由的业务字段
}
```

服务端从 `AI_MODEL_CONFIGS[modelType]` 取 URL 与 headers，不保存任何配置。

**服务端工具**（均在 `src/lib/server/`）：`llmRoute.ts`（`handleLlmRoute` 公共处理器）、`urlGuard.ts`（出站 URL 校验）、`rateLimit.ts`（限流）。

---

### 2.3 `POST /api/match`

**用途**：把数据库条目与 JD 一起发给模型，做语义匹配分析。

这是本项目唯一的 AI 匹配接口。v1.0 计划中的 `/api/jd-parse`、`/api/tailor`、`/api/ai-adjust` 三个路由**全部取消**（设计依据见 [03-generation-algorithm.md](./03-generation-algorithm.md) §9）。

**请求**：

```ts
{
  apiKey: string;
  model: string;
  modelType: AIModelType;
  apiEndpoint?: string;

  /** JD 原文，不预解析 */
  jdRaw: string;

  /** 公司名与岗位名，供模型理解上下文 */
  company: string;
  position: string;

  /**
   * 待评估的条目。
   * 由客户端的 buildMatchPrompt() 完成序列化，服务端只做透传 ——
   * 这样 prompt 的确定性由纯函数保证，服务端不参与字符串构造。
   */
  prompt: string;
}
```

**响应**：

```ts
{
  success: true,
  /** 模型返回的原始文本，由客户端解析与校验 */
  raw: string,
  /** 实际使用的模型标识，用于写入 AnalysisCache */
  modelId: string,
}
```

**错误响应**：

```ts
{ success: false, error: string, details?: string, retryable: boolean }
```

**关键设计：prompt 在客户端构造**

`buildMatchPrompt()` 是纯函数，放在客户端（`src/lib/match/buildMatchPrompt.ts`），服务端只负责透传。

| 理由 | 说明 |
|---|---|
| 确定性可测 | 纯函数可以直接写单元测试断言「100 次调用输出相同」，不需要启动服务端 |
| 服务端保持无状态 | 服务端不接触数据库条目，只做转发，减少数据暴露面 |
| 便于调试 | 用户可在浏览器控制台检查实际发出的 prompt 全貌 |

**服务端仍要做的三件事**：

1. 按 `AI_MODEL_CONFIGS[modelType]` 取 URL 与 headers
2. 注入 `temperature` 与 `seed`（从 `LLM_PARAMS` 读取，**不由客户端传入** —— 防止客户端误传高温度破坏稳定性）
3. 强制 JSON 输出模式（若 Provider 支持）

**不做流式**：分析结果是一次性的结构化 JSON，流式反而增加前端拼接复杂度。

**超时**：60 秒。超时后客户端重试 1 次（指数退避），仍失败则不渲染推荐标注，候选清单与生成流程照常。

---

### 2.4 已取消的路由（v1.0 计划）

| 路由 | 原用途 | 取消原因 |
|---|---|---|
| `/api/jd-parse` | JD 结构化解析 | JD 不再预解析，原文直传模型（见 [02-data-model.md](./02-data-model.md) D18） |
| `/api/tailor` | 经历针对性改写 | 内容改写能力推迟到后续版本 |
| `/api/ai-adjust` | 批量语义打分修正 | 确定性打分方案已废弃，不存在需要修正的分数 |

**这意味着后续若要接入 AI 改写能力，需要新增 `/api/tailor` 路由。** 本版不实现，但 [03-generation-algorithm.md](./03-generation-algorithm.md) §3.3 的提示词中已预留 `suggestedFocus` 字段 —— 模型在分析时顺带给出「建议突出什么」，后续改写环节可直接使用。

---

## 3. 服务端公共模块

### 3.1 不抽公共层，直接写在 `/api/match` 里

v1.0 计划抽出 `src/lib/server/aiClient.ts` 作为公共层，**已取消** —— 它只有一个调用方（`/api/match`）。按 ponytail 梯子第 7 级，这是「为不存在的复用而抽象」。

`/api/match` 内部直接完成：取配置 → 注入 `temperature`/`seed` → 调用 → 返回。约 180 行，含降级与错误处理。

**什么时候再抽**：出现第二个 AI 路由时。原计划的 `/api/tailor`（AI 改写）是下一个候选，到那时再抽不迟。

### 3.2 温度注入必须在服务端

`temperature` 与 `seed` **不由客户端传入**，而是服务端从 `LLM_PARAMS` 读取后注入。

| 理由 | 说明 |
|---|---|
| 防止误传 | 客户端若因 bug 传入 `temperature: 0.7`，会直接破坏匹配结果的稳定性，且难以排查 |
| 集中管控 | 稳定性参数的调整只需改一处 |
| 与可复现性要求一致 | 用户明确要求结果「不要每次相差很远」，这类参数不应暴露为可变输入 |

## 4. 安全模型

### 4.1 数据流向

```
浏览器 localStorage
  ├── 职业数据库
  ├── 简历数据
  ├── 投递目标
  └── API Key
        │
        │  用户主动触发 AI 功能时，Key 随请求体发送
        ▼
本地 Node 服务（pnpm dev / 自托管）
        │
        │  透传，不记录
        ▼
AI Provider（v1：DeepSeek）
```

### 4.2 明确的安全边界

| 项 | 状态 |
|---|---|
| 数据是否上传到本项目服务器 | ❌ 否。本项目无后端数据库，服务端仅做请求转发 |
| API Key 是否持久化在服务端 | ❌ 否。每次请求由客户端携带 |
| 服务端是否记录简历/JD 正文 | ❌ 不应记录。实现时禁止在此链路上打日志 |
| 简历数据是否发给 AI Provider | ⚠️ **会**。点击「智能分析」时，JD 原文与全部条目内容会发给 DeepSeek。这是功能必需，需在界面上明确告知 |
| 数据发给 Provider 的时机 | **仅在用户主动点击「智能分析」时**。指纹命中（缓存复用）时不发请求 |
| API Key 存储位置 | ⚠️ localStorage（明文）。与上游行为一致 |

### 4.3 必须在界面告知用户的事

在 AI 配置页面与首次使用 AI 功能时，明确提示：

> 点击「智能分析」时，你的岗位描述与全部经历内容会发送给 DeepSeek 用于分析。API Key 保存在你的浏览器本地，不会上传到本工具的服务器。分析结果会保存在本地，之后再次打开不会重复发送，除非你主动点击「重新分析」。

**这是诚实性问题，不是可选的 UI 文案。** 用户有权知道自己的简历内容被发到了哪里。

### 4.4 部署形态对安全的影响

| 部署形态 | 说明 |
|---|---|
| **本地运行**（`pnpm dev` / `pnpm start` 在本机） | 推荐。数据与 Key 全程不出本机（除发给 Provider 的部分） |
| **部署到公网服务器** | ⚠️ 需注意：服务端会短暂接触 API Key 与简历正文。应自行确认服务器可信，并配置 HTTPS |

**本项目的定位是本地工具**，不建议部署为公开服务（也涉及 [04-development-plan.md](./04-development-plan.md) §10.1 的许可证边界）。

---

## 5. 图片存储

### 5.1 问题

上游把照片（`basic.photo`）与证书（`Certificate.url`）存为 Base64 字符串放在 localStorage。localStorage 配额约 5MB，2-3 张证书图片即可撑满，导致 `QuotaExceededError`。

上游对此已有防御（`useResumeStore.ts` 的 `warnPersistFailure`），但只是捕获错误并警告 —— 数据实际上没有存下来。

### 5.2 方案

新增 `src/lib/imageStore.ts`：

```ts
const DB_NAME = "ImageStoreDB";
const STORE = "images";

/** 存入 IndexedDB，返回引用字符串 `idb:img_<uuid>` */
export async function putImage(blob: Blob): Promise<string>;

/** 由引用取回 Blob */
export async function getImage(ref: string): Promise<Blob | null>;

/** 删除 */
export async function deleteImage(ref: string): Promise<void>;

/** 把 `idb:` 引用解析为可直接用于 <img src> 的 blob: URL */
export async function resolveImageUrl(ref: string): Promise<string>;

/** 批量解析 DOM 中的图片引用 */
export async function resolveImagesInElement(el: HTMLElement): Promise<void>;
```

### 5.3 引用格式

| 值的形式 | 含义 | 处理 |
|---|---|---|
| `idb:img_<uuid>` | IndexedDB 引用 | 解析为 `blob:` URL |
| `data:image/...` | Base64 内联（旧数据） | 原样透传 |
| `https://...` / `/avatar.png` | 外链 | 原样透传 |

**兼容性**：旧数据（Base64）无需迁移即可继续工作。用户重新上传图片时自动转为 IndexedDB 引用。

### 5.4 与导出链路的衔接

上游 `src/utils/export.ts` 的 `optimizeImages` 与 `bakeObjectFitCoverImages` 处理的是 DOM 中已渲染的 `<img>` 元素。

**因此必须在渲染前完成解析**：

```
物化 → 写入 ResumeData（含 idb: 引用）
     → 渲染前调用 resolveImagesInElement() 把 idb: 换成 blob: URL
     → 渲染
     → 导出（此时 DOM 中已是可用的 blob: URL）
```

**风险点**：若在导出时才解析，会因异步时序问题导致图片缺失。解析必须发生在渲染阶段。

### 5.5 备份的边界

全库 JSON 备份**不包含图片二进制**（会让备份文件膨胀到几十 MB）。

导出时提示：

> 备份不包含照片与证书图片。恢复后需重新上传图片。

**备选方案**（若用户反馈不便）：提供「完整备份（含图片）」选项，图片以 Base64 内联进 JSON。这会让文件变大但保证完整性。作为 P2 考虑。

---

## 6. 环境变量

| 变量 | 用途 | 是否必需 |
|---|---|---|
| `TRUST_PROXY` | 设为 `1` 时信任 `X-Forwarded-For`。**只有确认跑在反向代理后面才可设** —— 否则限流可被伪造的转发头绕过 | 否 |
| `PORT` / `HOSTNAME` | 服务监听地址（见 `server.mjs`） | 否 |
| `DEEPSEEK_API_KEY` | 评测 / canary 脚本用的 Key（**服务端运行时不读** —— 用户 Key 由客户端传入） | 否 |
| `EVAL_API_KEY` | 同上，通用名，优先于 provider 专用名 | 否 |
| `VITE_SITE_URL` | 站点对外域名，供 canonical / og:image / hreflang / robots / sitemap 使用。**未设则不输出 sitemap**，robots 也不写 Sitemap 行 | 否 |

**本项目不新增任何必需的环境变量。** 所有 AI 配置由用户在界面上完成。

---

## 7. 实现检查清单

实现 AI 相关功能时，逐项核对：

**可复现性（最高优先级，用户明确要求）**

- [ ] `buildMatchPrompt` 是纯函数，单元测试断言同一输入 100 次输出逐字节相同
- [ ] 条目序列化顺序为「板块 → `endTimestamp` 降序 → `id` 升序」，不依赖插入顺序
- [ ] 未显式排序的地方没有使用 `Object.keys()` 的返回顺序
- [ ] prompt 构造路径上没有任何 `Date.now()` / `Math.random()` / `toLocaleString` 调用
- [ ] `temperature` 与 `seed` 由**服务端**从 `LLM_PARAMS` 注入，不接受客户端传值
- [ ] 绝不把上一次的分析结果放进 prompt
- [ ] `contentFingerprint` 包含全部条目内容字段 + JD 正文 + `modelId` + `promptVersion`
- [ ] 指纹一致时不发请求，直接复用结果
- [ ] 数据变更时**提示**用户而非自动重跑

**结果校验**

- [ ] `validateMatchResult` 校验 id 合法性、无遗漏、无重复、等级枚举
- [ ] `level` 为 `not_recommended` 时，`evidence` 必须能在描述原文中找到，否则自动提升为 `recommended`
- [ ] `rankedIds` 不重不漏，top-N 由它计算得出
- [ ] `matchedSkills` 中的每一项必须能在该条目的 `skills` 或 `description` 中找到

**降级**

- [ ] 调用前检查 `isConfigured()`，未配置时进入手动选择模式
- [ ] 无标注状态下不渲染任何标记区块，且勾选与生成功能完全不变
- [ ] 超时、非法 JSON、鉴权失败、空结果四种情况均能产出可用简历
- [ ] 降级时给用户明确的提示文案，不静默切换

**安全与隐私**

- [ ] 服务端不打印简历正文、JD 正文、API Key
- [ ] 界面上明确告知用户：简历内容与 JD 会发送给所选的 AI 服务商

**其他**

- [ ] 图片在渲染阶段解析为 `blob:` URL，不在导出阶段
