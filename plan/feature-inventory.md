# 功能清单（代码清理基线）

> 生成方式：静态扫描 + 逐文件核对，每条都带 `文件:行`。**本清单只读盘点，未改动任何源码。**
> 扫描日期：2026-09-19 · 基线 commit：`f88c7bd`
> 规模：`src/` 302 个 `.ts/.tsx` 文件，37,764 行

## 怎么核对这份清单

| 断言类型 | 核对命令 |
|---|---|
| 路由存在 | `grep "id: '/" src/routeTree.gen.ts` |
| 文件无人引用 | `node /tmp/orphan-scan.mjs`（解析相对路径 + `@/` 别名 + index 兜底） |
| i18n key 缺失 | `node /tmp/i18n-scan3.mjs` |
| 依赖是否被 import | `grep -rl "<pkg>" src scripts` |

---

## 一、页面与路由

来源 `src/routeTree.gen.ts`（TanStack Router 文件式路由，由 `src/routes/**` 自动生成）。

### 1.1 公开页（SSR，可被搜索引擎索引）

| 路由 | 路由文件 | 页面组件 | 说明 |
|---|---|---|---|
| `/` | `src/routes/index.tsx` | 重定向 | 跳默认语言 |
| `/$locale` | `src/routes/$locale.tsx` | [page.tsx](src/app/(public)/[locale]/page.tsx) | 落地页，支持 `zh`/`en`；带 hreflang、canonical、OG |
| `/sitemap.xml` | [sitemap[.]xml.ts](src/routes/sitemap[.]xml.ts) | — | 服务端生成。**`public/` 下不能有同名文件**，否则静态文件遮蔽路由 |
| `/robots.txt` | [robots[.]txt.ts](src/routes/robots[.]txt.ts) | — | 同上 |

落地页分区（[page.tsx:16-20](src/app/(public)/[locale]/page.tsx#L16)）：`SiteNav` → `Hero` → `FeatureGrid` → `TemplateRow` → `JudgementBand` → `CtaBand` → `SiteFooter`。

### 1.2 工作台（`ssr: false`，`noindex`）

`/app/dashboard` 是布局壳（[dashboard.tsx](src/routes/app/dashboard.tsx) → [client.tsx](src/app/app/dashboard/client.tsx)），侧边栏 6 项：

| 侧边栏项 | 路由 | 页面文件 | 组件 |
|---|---|---|---|
| 职业数据库 | `/app/dashboard/profile` | [profile.tsx](src/routes/app/dashboard/profile.tsx) | [ProfileWorkbench.tsx](src/app/app/dashboard/profile/ProfileWorkbench.tsx) |
| 我的简历 | `/app/dashboard/resumes` | [resumes.tsx](src/routes/app/dashboard/resumes.tsx) | [ResumeWorkbench.tsx](src/app/app/dashboard/resumes/ResumeWorkbench.tsx) |
| 投递目标 | `/app/dashboard/targets` | [targets.tsx](src/routes/app/dashboard/targets.tsx) | [TargetsWorkbench.tsx](src/app/app/dashboard/targets/TargetsWorkbench.tsx) |
| 模板 | `/app/dashboard/templates` | [templates.tsx](src/routes/app/dashboard/templates.tsx) | [page.tsx](src/app/app/dashboard/templates/page.tsx) |
| AI 设置 | `/app/dashboard/ai` | [ai.tsx](src/routes/app/dashboard/ai.tsx) | [page.tsx](src/app/app/dashboard/ai/page.tsx) |
| 设置 | `/app/dashboard/settings` | [settings.tsx](src/routes/app/dashboard/settings.tsx) | [page.tsx](src/app/app/dashboard/settings/page.tsx) |

### 1.3 全屏页（不在 dashboard 布局内）

⚠️ **这两个页面不在 `DashboardLayout` 之下**，所以 `useSavesMirror` 是分两处挂载的（[useSavesMirror.ts:93](src/hooks/useSavesMirror.ts#L93) 有幂等守卫）。

| 路由 | 路由文件 | 页面文件 | 说明 |
|---|---|---|---|
| `/app/workbench/$id` | [workbench/$id.tsx](src/routes/app/workbench/$id.tsx) | [workbench/[id]/page.tsx](src/app/app/workbench/[id]/page.tsx) | 简历编辑器主界面 |
| `/app/preview-template/$id` | [preview-template/$id.tsx](src/routes/app/preview-template/$id.tsx) | — | 模板预览 |

### 1.4 门禁

[RequireUser.tsx](src/app/app/dashboard/RequireUser.tsx) —— 三个板块（职业数据库 / 我的简历 / 投递目标）都包了这一层。
判空用 `currentUserId`，**不是** `profile == null`（后者在 hydrate 前也为真，会闪弹窗）。
无当前用户时**不渲染 children**，直接换成 [UserSelectDialog.tsx](src/app/app/dashboard/UserSelectDialog.tsx)。

---

## 二、HTTP 接口

### 2.1 `POST /api/match` 与 `POST /api/tag` —— 共用一个处理器

两条路由文件加起来 10 行，逻辑全在 [llmRoute.ts](src/lib/server/llmRoute.ts)。

**请求体**

| 字段 | 类型 | 必填 | 校验位置 | 说明 |
|---|---|---|---|---|
| `apiKey` | `string` | 是 | [llmRoute.ts:47](src/lib/server/llmRoute.ts#L47) | DeepSeek key，非空即可 |
| `modelType` | `"deepseek"` | 是 | [llmRoute.ts:43](src/lib/server/llmRoute.ts#L43) | 只有这一个合法值，其余一律 400 |
| `model` | `string` | 否 | [llmRoute.ts:57](src/lib/server/llmRoute.ts#L57) | 缺省用 `DEFAULT_MODEL = "deepseek-chat"` |
| `prompt` | `string` | 是 | [llmRoute.ts:50](src/lib/server/llmRoute.ts#L50) | **整段由客户端构造**，服务端只透传不拼接 |

**响应**

| 情况 | HTTP | 响应体 |
|---|---|---|
| 成功 | 200 | `{ success: true, raw: string, modelId: string }` |
| 参数非法 | 400 | `{ success: false, error: string, retryable: false }` |
| 上游 4xx（鉴权/限流） | 400 | `{ success: false, error, retryable: false }` |
| 上游 5xx / 超时 | 502 | `{ success: false, error, retryable: true }` |

**服务端注入、不接受客户端传值**（[buildMatchPrompt.ts:42](src/lib/match/buildMatchPrompt.ts#L42)）：
`temperature: 0`、`seed: 42`、`stream: false`、`response_format: { type: "json_object" }`、`max_tokens: 8192`。
理由：前端误传高温度会静默破坏可复现性且极难排查；`max_tokens` 写死是因为**曾经撞上过**（fin-01 那份 20 条经历的档案被截断在 8192）。

**其他行为**
- 限流：[guardRequest](src/lib/server/rateLimit.ts#L107) 按 `桶:客户端IP` 计，[LIMITS](src/lib/server/rateLimit.ts#L26) 定义上限
- 超时：60s（[upstream.ts:14](src/lib/server/upstream.ts#L14)），与客户端 `request.signal` 合并
- 截断检测：上游 `finish_reason === "length"` 时**明确报错**而不是让半截 JSON 落库（[llm.ts:104](src/lib/server/llm.ts#L104)）

**客户端调用方**

| 调用方 | 目标 | 标志 |
|---|---|---|
| [analyzeMatch.ts:71](src/lib/match/analyzeMatch.ts#L71) | `/api/match` | 可重试错误重试 1 次，间隔 1200ms；JSON 解析放在 attempt 内 |
| [analyzeTags.ts:126](src/lib/profile/analyzeTags.ts#L126) | `/api/tag` | 同上 |

### 2.2 `/api/saves` —— 存档目录读写

> ⚠️ **全项目唯一按请求读写用户数据的端点。** 默认**关闭**（`SAVES_ENABLED !== "1"` 时一律 404，与「路由不存在」不可区分）。开启后部署到公网 = 任何人都能读到所有人的姓名、联系方式与经历。

| 方法 | 参数 | 成功响应 | 错误 |
|---|---|---|---|
| `GET` | 无 → 整棵树；`?userId=` → 单个用户 | `{ ok: true, root: string, users: Record<userId, RawSaveTree> }` | 400 校验失败 / 500 写盘失败 |
| `POST` | body `{ userId, kind, id, data }` | `{ ok: true, path: string }`（相对路径） | 400 / 500 |
| `DELETE` | body `{ userId, kind, id }` | `{ ok: true, path: string }` | 400 / 500 |

`kind` 合法值（[kinds.ts](src/lib/saves/kinds.ts)）：`"profile"` \| `"resume"` \| `"jd"`。
校验失败的判据：错误信息以 `[saves]` 开头 → 400，否则 500。
**注意**：没有「删整个用户目录」这个操作（有意为之，见 `removeUserDir`）。

客户端调用方只有 [useSavesMirror.ts:64](src/hooks/useSavesMirror.ts#L64)。

### 2.3 外部接口

| 服务 | 端点 | 用途 | 调用位置 |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | 匹配分析 / 经历归类 / PDF 简历识图 | [llm.ts:74](src/lib/server/llm.ts#L74)（仅在服务端） |
| GitHub GraphQL | `https://api.github.com/graphql` | 拉贡献日历 | [GithubContribution.tsx:72](src/components/shared/GithubContribution.tsx#L72)（**浏览器直连**，带用户 token） |

---

## 三、数据存储

### 3.1 真相源：`localStorage`（zustand persist）

| Store | 文件 | 用户隔离方式 | 版本迁移 |
|---|---|---|---|
| 职业数据库 | [useCareerProfileStore.ts](src/store/useCareerProfileStore.ts) | `profiles: Record<userId, CareerProfile>` | `USER_SCOPE_VERSION = 1` |
| 简历 | [useResumeStore.ts](src/store/useResumeStore.ts) | `byUser / activeByUser` | 见 [userScope.ts:113](src/store/userScope.ts#L113) |
| 投递目标 | [useJobTargetStore.ts](src/store/useJobTargetStore.ts) | `targetsByUser / analysesByUser / cachesByUser` | `TARGET_SCOPE_VERSION = 2` |
| AI 配置 | [useAIConfigStore.ts](src/store/useAIConfigStore.ts) | **不隔离**（全局单例） | — |

迁移逻辑集中在 [userScope.ts](src/store/userScope.ts)；旧数据归入 `LEGACY_USER_ID = "legacy-default"`。

### 3.2 镜像：`saves/<userId>/*.json`

[useSavesMirror.ts](src/hooks/useSavesMirror.ts) 单向订阅三个 store，防抖 1500ms 写到磁盘。
**真相源始终是 localStorage**；请求失败不弹 toast，只控制台提示一次，连续失败 3 次后放弃（静态部署下端点根本不存在）。

### 3.3 图片：IndexedDB

[imageStore.ts](src/lib/imageStore.ts) —— 证件照以 `idb:` 引用存储，读取走 [useResolvedImage.ts](src/hooks/useResolvedImage.ts)。

---

## 四、模板系统

注册表 [registry.ts](src/components/templates/registry.ts)：4 个模板，各自 `config.ts` + `index.tsx` + 8 个 section 组件。

| 模板 | id | i18n key | 截图 |
|---|---|---|---|
| 经典 | `classic` | `classic` | `public/template-snapshots/{zh,en}/classic.jpg` |
| 两栏 | `modern` | `modern` | 同上 |
| 左-右 | `left-right` | `leftRight` ← **需转换** | 同上 |
| 时间轴 | `timeline` | `timeline` | 同上 |

`left-right` → `leftRight` 的映射在**两处各写了一遍**（[TemplateGallery.tsx:21](src/app/app/dashboard/resumes/TemplateGallery.tsx#L21)、[templates/page.tsx:31](src/app/app/dashboard/templates/page.tsx#L31)）。

截图清单由 `src/generated/templateSnapshotManifest.ts` 生成（`pnpm generate:template-snapshots`）。

---

## 五、产物交付

| 能力 | 函数 | 位置 | 产物 |
|---|---|---|---|
| 浏览器打印 | `exportResumeToBrowserPrint` | [print.ts:17](src/utils/print.ts#L17) | iframe + `window.print()`，**有文字层** |
| 长图 PDF | `exportToLongPagePdf` | [export.ts:400](src/utils/export.ts#L400) | jspdf + canvas，**无文字层** |
| 长图 | `exportToLongPageImage` | [export.ts:463](src/utils/export.ts#L463) | PNG |
| JSON | `exportResumeAsJson` | [export.ts:106](src/utils/export.ts#L106) | 可再导入 |
| Markdown | `exportResumeAsMarkdown` | [export.ts:133](src/utils/export.ts#L133) | turndown 转 |
| 全库备份 | `BackupPanel` | [BackupPanel.tsx](src/app/app/dashboard/settings/BackupPanel.tsx) | 全部用户数据 |

> ⚠️ **已知缺陷（`plan/task_plan.md` §B2）**：走 Chromium 打印的路径，160 个汉字里 18 个（11.3%）落在 U+2E80–U+2FDF 康熙部首区（`页→⻚`、`立→⽴`），**复制粘贴与 ATS 解析拿到错字**。字形正常，所以肉眼看不出来。
> 「文字可选中、可被 ATS 解析」这句文案目前是**过度承诺**。

统一出口：[PdfExport.tsx](src/components/shared/PdfExport.tsx)（右上角导出菜单）。

---

## 六、AI 能力

| 链路 | 入口 | Prompt 构造（纯函数，可单测） | 结果校验 |
|---|---|---|---|
| 岗位匹配 | [analyzeMatch.ts](src/lib/match/analyzeMatch.ts) | [buildMatchPrompt.ts](src/lib/match/buildMatchPrompt.ts) `PROMPT_VERSION = "v5"` | [validateMatchResult.ts](src/lib/match/validateMatchResult.ts) |
| 经历归类 | [analyzeTags.ts](src/lib/profile/analyzeTags.ts) | [buildTagPrompt.ts](src/lib/profile/buildTagPrompt.ts) | `validateTagResult` |
| PDF 简历导入 | [importFromAi.ts](src/lib/profile/importFromAi.ts) | — | — |

**契约要点**：v4 起「**模型只排序，划线交给代码**」—— `level` 由名次推导（[validateMatchResult.ts:432](src/lib/match/validateMatchResult.ts#L432)），不再由模型判定。
缓存：[analysisCache.ts](src/lib/match/analysisCache.ts)，数据未变时**完全不发请求**。

评测体系：[`src/eval/`](src/eval/)（指标 / 阈值 / 运行器 / 报告）+ `scripts/eval.ts`。**不属于产品功能**，是开发期工具，不进入打包产物。

---

# 附：盘点中发现的可清理项

> 以下是**证据**，不是决定。删不删、什么时候删，由后续步骤定。
> 分级：**P0** = 用户可见的缺陷；**P1** = 确定的死代码；**P2** = 需人工判断。

## P0 · 用户可见缺陷（不是清理，是修 bug）

| # | 问题 | 位置 | 表现 |
|---|---|---|---|
| 1 | `workbench.layout` 整个命名空间在 zh/en 里**都不存在** | 请求处 [SidePanel.tsx:208](src/components/editor/SidePanel.tsx#L208)、[SidePanel.tsx:220](src/components/editor/SidePanel.tsx#L220) | 「添加板块」弹出层里，非必填板块（专业技能 / 项目经历 / 自我评价 / 校园经历 / 获奖情况）**标题显示成 `layout.standardSections.sections.skills` 这样的原始 key** |
| 2 | `profile.hints.categoryPlaceholder` 不存在 | [EntityEditor.tsx:121](src/app/app/dashboard/profile/EntityEditor.tsx#L121) | zh.json 里定义的是 `hints.category.placeholder`（**多一个点**），代码请求的是 `hints.categoryPlaceholder`。类别输入框 placeholder 显示成原始 key |
| 3 | `profile.empty` 不存在 | [EntityList.tsx:44](src/app/app/dashboard/profile/EntityList.tsx#L44) | 空列表提示显示成 `empty` |
| 4 | `profile.languageLabel` 不存在 | [ResumeWorkbench.tsx:137](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L137) | 生成的简历标题里出现 `languageLabel` |
| 5 | `dashboard.resumes.importDialog.description` 不存在 | [ImportResumeDialog.tsx:52](src/app/app/dashboard/resumes/ImportResumeDialog.tsx#L52) | 导入弹窗副标题显示成原始 key |

复现命令：
```bash
node scripts/audit/i18n-scan.mjs 2>&1 | grep -v '\${'
```
字典缺 key 时 [utils.ts:60](src/i18n/compat/utils.ts#L60) 的行为是 `return key` —— **静默显示 key 本身，不报错**。

## P1 · 确定的死代码

| # | 对象 | 判定依据 |
|---|---|---|
| 6 | [dashboard/resumes/utils.ts](src/app/app/dashboard/resumes/utils.ts) | 无任何 import。源码里留有一句注释：[importFromAi.ts:20](src/lib/profile/importFromAi.ts#L20)「文本清洗（**原在 resumes/utils.ts**，被这里与简历导入共用）」—— 功能已迁走，文件没删 |
| 7 | [components/shared/icons/PdfIcon.tsx](src/components/shared/icons/PdfIcon.tsx) | 全项目零引用 |
| 8 | [components/ui/alert.tsx](src/components/ui/alert.tsx) | 全项目零引用。注意与 `alert-dialog.tsx`（5 处使用）**不是同一个东西**，别误删 |
| 9 | `DEFAULT_FONT_FAMILY` 的 `export` | [fonts.ts:23](src/utils/fonts.ts#L23) 导出，但只有同文件 [fonts.ts:28](src/utils/fonts.ts#L28) 用。降级为非导出即可 |
| 10 | i18n 死 key | `node scripts/audit/i18n-scan.mjs` 报 **191 / 715** 条 zh.json key 静态扫不到使用者。**这是上界不是精确值** —— 含大量动态拼接 key（`t(\`basicFields.${field.key}\`)` 等），需逐命名空间人工核 |

### P1 续：交互层的死代码

| # | 对象 | 位置 | 判定依据 |
|---|---|---|---|
| 16 | `PreviewPanel` 的 **6 个 props 全部未使用** | [preview/index.tsx:15-20](src/components/preview/index.tsx#L15) 声明，[:59-64](src/components/preview/index.tsx#L59) 解构 | 逐名 grep 全部出现行：**只有声明行 + 解构行，函数体内零使用**。两处调用方（[page.tsx:347](src/app/app/workbench/[id]/page.tsx#L347)、[MobileWorkbench.tsx:128](src/components/mobile/MobileWorkbench.tsx#L128)）仍在传 |
| 17 | `startRef` / `previewRef` 两个 ref | [preview/index.tsx:80-81](src/components/preview/index.tsx#L80) | 挂到 div（[:219](src/components/preview/index.tsx#L219)、[:227](src/components/preview/index.tsx#L227)）但**全项目从无 `startRef.current` 读取** |
| 18 | 3 个空回调 | [MobileWorkbench.tsx:132-135](src/components/mobile/MobileWorkbench.tsx#L132) | `toggleSidePanel/toggleEditPanel/togglePreviewPanel={() => {}}` —— 空函数，**且接收方（见 #16）根本不读这些 prop** |
| 19 | 模块级 `lineHeightOptions` | [SidePanel.tsx:33-37](src/components/editor/SidePanel.tsx#L33) | 组件内 [:120](src/components/editor/SidePanel.tsx#L120) 又定义了一份同名的，模块级那份零引用 |
| 20 | `LAYOUT_CONFIG` 的 3 个键 | [workbench/[id]/page.tsx:28-31](src/app/app/workbench/[id]/page.tsx#L28) | `SIDE_COLLAPSED` / `EDIT_FOCUSED` / `PREVIEW_FOCUSED` 无引用；只有 `.DEFAULT` 在 [:172](src/app/app/workbench/[id]/page.tsx#L172) 被用 |
| 21 | `DragHandle` 的 `show` 参数 | [workbench/[id]/page.tsx:34](src/app/app/workbench/[id]/page.tsx#L34) | 默认 `true`，两处调用（[:315](src/app/app/workbench/[id]/page.tsx#L315)、[:332](src/app/app/workbench/[id]/page.tsx#L332)）**都不传**，故 `if (!show) return null` 永不触发 |
| 22 | `onDelete` / `onCancel` 两 props ×3 组件 | [EducationItem.tsx:20-21](src/components/editor/education/EducationItem.tsx#L20)、[ExperienceItem.tsx:20-21](src/components/editor/experience/ExperienceItem.tsx#L20)、[ProjectItem.tsx:21-22](src/components/editor/project/ProjectItem.tsx#L21) | 接口声明了、调用方也传了，但组件内**未解构使用** |
| 23 | 注释掉的 JSX 块 | [AlignSelector.tsx:96-98](src/components/editor/basic/AlignSelector.tsx#L96) | 对齐按钮下方的文字标签被整块注释（改用 `title` 属性替代） |
| 24 | `LanguageSwitch` 在编辑器范围内零调用 | [LanguageSwitch.tsx](src/components/shared/LanguageSwitch.tsx) | 全仓唯一引用是 [SiteNav.tsx:4](src/components/landing/SiteNav.tsx#L4)（落地页）。**不是死文件**，但编辑器/工作台不提供语言切换 |
| 25 | 侧边栏子菜单整块 | [client.tsx:157-172](src/app/app/dashboard/client.tsx#L157) | `sidebarItems` **无一项带 `items` 字段** → 永不渲染。配套的 [:85-87](src/app/app/dashboard/client.tsx#L85) `if (item.items) { }` 是**空分支** |
| 26 | `collapsible` 状态 | [client.tsx:80](src/app/app/dashboard/client.tsx#L80) | `setCollapsible` 全文件只出现 **1 次**（就是声明处），恒为 `"icon"` |
| 27 | 向导 `Step` 类型的 `"fit"` | [CreateResumeWizard.tsx:49](src/app/app/dashboard/resumes/CreateResumeWizard.tsx#L49) | 无任何 `setStep("fit")`；源码注释 :156 自认已移除 |
| 28 | 未使用 import | [CreateResumeWizard.tsx:9-10](src/app/app/dashboard/resumes/CreateResumeWizard.tsx#L9) | `Loader2`、`TriangleAlert` 只出现在 import 行 |
| 29 | 未使用变量 + 重复导入 | [ResumeWorkbench.tsx:179](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L179) / [:167](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L167) | 复制后 `const resumeId = addResume(...)` 结果未用（故复制后不跳转）；:167 的 `await import("@/utils/uuid")` 遮蔽顶部 :21 的静态导入 |
| 30 | `Placeholder` 兜底分支不可达 | [ProfileWorkbench.tsx:53](src/app/app/dashboard/profile/ProfileWorkbench.tsx#L53) | `SECTION_DEFS` 8 个 id 被 :45-51 **全覆盖**，`unknownSection` 分支永不执行 |
| 31 | PDF 导入的 6 个 i18n key | zh.json / en.json `dashboard.resumes.importDialog.pdf*` / `aiConfigRequired` | 逐 key `grep -rn` 全部为 **0 引用** —— 功能已删，文案留下 |
| 32 | 空 catch 吞异常 ×3 | [resumes/utils.ts:10,16,23](src/app/app/dashboard/resumes/utils.ts#L10) | `} catch (error) { }` —— 该文件本身也是孤儿（见 #6） |

> 其余 `{/* ... */}` 扫描命中 30+ 处，**全部是分区标题注释**（`{/* 主题色设置 */}` 这类），不是注释掉的代码 —— 不要清理。

### P1 续：未走 i18n 的硬编码中文（40+ 处，抽样）

| 位置 | 文案 |
|---|---|
| [EditorHeader.tsx:104](src/components/editor/EditorHeader.tsx#L104) | `"未命名简历"`、[:107](src/components/editor/EditorHeader.tsx#L107) placeholder「简历名称」 |
| [ExperienceItem.tsx:156](src/components/editor/experience/ExperienceItem.tsx#L156) | `"家里蹲公司"`（空公司名兜底） |
| [ProjectItem.tsx:198](src/components/editor/project/ProjectItem.tsx#L198) | `"未命名项目"` |
| [CustomItem.tsx:139](src/components/editor/custom/CustomItem.tsx#L139) | `"未命名模块"`；[:33-58](src/components/editor/custom/CustomItem.tsx#L33) 全部 label/placeholder |
| [MobileWorkbench.tsx:72](src/components/mobile/MobileWorkbench.tsx#L72) | `"基本信息"`；[:144-146](src/components/mobile/MobileWorkbench.tsx#L144) `"内容"/"样式"/"预览"` |
| [CertificatesPanel.tsx:31](src/components/editor/certificates/CertificatesPanel.tsx#L31) | `toast.error("Format error")`、[:51](src/components/editor/certificates/CertificatesPanel.tsx#L51) `"Upload error"` —— **源码自带 `// Or use i18n` 注释，是明确的 TODO** |
| [preview/index.tsx:46](src/components/preview/index.tsx#L46) | 分页线文案 `第{pageNumber}页结束` |

## P2 · 需人工判断

| # | 对象 | 情况 | 判断点 |
|---|---|---|---|
| 11 | `@heroui/react` | **整个依赖只为 [providers.tsx:9](src/app/providers.tsx#L9) 的一个 `<HeroUIProvider locale>` 包裹**，全项目没用任何 HeroUI 组件。但 `tailwind.config.ts:182` 把 `heroui()` 注册为插件、`:8` 扫 `node_modules/@heroui/theme/dist` 进 content | 一个只用 `locale` prop 的 Provider 值不值这个体积？移除需同时改 `tailwind.config.ts` 两处 |
| 12 | `antd` | 只用在日期选择器（3 个文件）。与 HeroUI 并存 = **两套 UI 框架** | 是否收敛到一套 |
| 13 | `lodash` | 只用了 `lodash/throttle` 和 `lodash/debounce` 两个函数 | 换 10 行自写实现，省一个依赖 |
| 14 | i18n key 不一致 | zh 独有 5 条、en 独有 4 条。**逐条 grep 核实：这 9 个 key 路径在源码里零引用**（注意 `location` / `technologies` 作为数据字段名另有使用，但对应的 i18n 路径 `educationItem.*.location`、`projectItem.*.technologies` 无人读） | 是死 key，不是显示 bug |
| 15 | ~~依赖 `bump`~~ | **已核实为误报**：匹配到的是 `bump.config.ts` 与 `scripts/post-bump.mjs`，那是 `bumpp` 的配置，不是依赖 | 无需处理 |

### P2 续：行为异常

| # | 位置 | 现象 |
|---|---|---|
| 16 | [BasicPanel.tsx:209](src/components/editor/basic/BasicPanel.tsx#L209) | `deleteBasicField` 对 `name`/`title` 静默 `return`，但删除按钮**不是 disabled** —— 点了没反应 |
| 17 | [workbench/[id]/page.tsx:82](src/app/app/workbench/[id]/page.tsx#L82) | className 字符串在同一个 `cn()` 里**重复写了两遍**（:82-83、:281-283、:296-299） |
| 18 | [SaveBar.tsx:44](src/app/app/dashboard/profile/SaveBar.tsx#L44) | `catch {` 无绑定变量，只有泛化 toast，**拿不到 error 详情** |
| 19 | **三处删除无二次确认**：[TargetsWorkbench.tsx:362](src/app/app/dashboard/targets/TargetsWorkbench.tsx#L362)（删岗位，连带删掉该岗位的 matchAnalysis）、[EntityList.tsx:115](src/app/app/dashboard/profile/EntityList.tsx#L115)、[SkillGroupPanel.tsx:98](src/app/app/dashboard/profile/SkillGroupPanel.tsx#L98) | 对比：简历删除**有**确认框、用户删除**有**确认框。i18n 里存在 `common.deleteModuleConfirm` 文案，但这三处都没用 |
| 20 | [PhotoConfigDrawer.tsx:56](src/components/shared/PhotoConfigDrawer.tsx#L56) | `isMobile` 初始 `false`，挂载时不调 `handleResize()` —— **移动端首帧抽屉方向错误**（left 而非 bottom），等窗口 resize 才纠正 |
| 21 | [SidePanel.tsx:685](src/components/editor/SidePanel.tsx#L685) | 段落间距 Input 只挡 `>=1` 不挡上限，同组 Slider `max=50` —— 可输入任意大值 |
| 22 | [PhotoConfigDrawer.tsx:349](src/components/shared/PhotoConfigDrawer.tsx#L349) | 「关闭」按钮用 `variant="destructive"`（红色危险色）渲染一个无破坏性的动作 |
| 23 | [PdfExport.tsx:258](src/components/shared/PdfExport.tsx#L258) | 「PDF(长页)」卡片复用 `PdfGlassIcon`，与「PDF」图标完全相同 |
| 24 | `export const runtime = "edge"` 不一致 | profile / resumes / targets / templates 四个 `page.tsx` 有；**settings 与 ai 没有** —— 是遗漏还是有意，需判断 |
| 25 | 两条互不相同的建简历路径 | [templates/page.tsx:191](src/app/app/dashboard/templates/page.tsx#L191) 直接 `createResume` 产出示例数据空白简历；[resumes](src/app/app/dashboard/resumes/) 走 4 步向导。模板页那条**不碰职业数据库**，与「档案 → 物化」的设计主线不同 |
| 26 | `addTarget` 的 `note?` 字段 | [useJobTargetStore.ts:34](src/store/useJobTargetStore.ts#L34) —— UI 从未写入（创建时只传 company/position/jdRaw） |

> 另：`react-grab`（devDependency）**不是死依赖** —— [ReactGrab.tsx:7](src/components/dev/ReactGrab.tsx#L7) 用动态 `import()` 且由 `import.meta.env.DEV` 守卫，只在开发期加载。

## 未发现的问题（反向证据）

以下常见「死代码」迹象在 `src/` 里**一处都没有** —— 这部分是干净的：

```bash
grep -rn "TODO\|FIXME\|XXX\|HACK" src     # 无输出
grep -rn "onClick={() => {}}" src          # 无输出
```

- 无 TODO / FIXME / HACK 注释
- 无空 `onClick` 桩
- `src/lib/**` 的全部 `export` 都有跨文件使用者
- `src/config/**`、`src/hooks/**` 的全部 `export` 都有跨文件使用者

---

## 核对命令汇总

两个扫描脚本已固化进仓库（`pnpm` 脚本未加，直接用 `node` 跑）：

```bash
node scripts/audit/orphan-scan.mjs   # 孤儿文件：解析相对路径 + @/ 别名 + index 兜底
node scripts/audit/i18n-scan.mjs     # i18n：按「译器变量 → 命名空间」关联，排除模板字面量噪音

grep -rn "TODO\|FIXME\|HACK" src   # 无输出
grep -rn "onClick={() => {}}" src    # 无输出
```

**两个脚本的已知边界，别当成结论用：**

| 脚本 | 边界 |
|---|---|
| `orphan-scan.mjs` | 只扫 `src/`。**`src/eval/report.ts` 与 `src/eval/runner.ts` 是误报** —— 它们被 `scripts/eval.ts` 引用，而脚本在 `src/` 之外 |
| `i18n-scan.mjs` | 191 条是**上界**：动态拼接 key（`t(\`basicFields.${field.key}\`)`）静态扫不出来，需按命名空间人工核。已确证的死 key 簇见 P1 #31；已确证的缺失 key 见 P0 #1–#5 |

---

## 状态说明

| 章节 | 状态 |
|---|---|
| 一、页面与路由 | ✅ 完成 |
| 二、HTTP 接口 | ✅ 完成 |
| 三、数据存储 | ✅ 完成 |
| 四、模板系统 | ✅ 完成 |
| 五、产物交付 | ✅ 完成 |
| 六、AI 能力 | ✅ 完成 |
| 附：可清理项 | ✅ 完成 |
| **按钮与交互（编辑器 / 各面板逐控件）** | ✅ 完成 → 见 [feature-interactions.md](feature-interactions.md) §一 |
| **按钮与交互（仪表盘各板块逐控件）** | ✅ 完成 → 见 [feature-interactions.md](feature-interactions.md) §二 |
