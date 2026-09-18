# JobLume Resume — 开发计划

| 项 | 值 |
|---|---|
| 文档版本 | v1.0 |
| 最后更新 | 2026-09-16 |
| 状态 | 待评审 |
| 前置阅读 | [01-PRD.md](./01-PRD.md)、[02-data-model.md](./02-data-model.md)、[03-generation-algorithm.md](./03-generation-algorithm.md) |

---

## 1. 仓库与开发基线

### 1.1 目录结构

```
JobLume_Resume/
├── docs/                    # 项目文档（本目录）
├── rawproject/              # ⚠️ 只读参考，不修改任何文件，已加入 .gitignore
├── src/                     # 开发代码（从 rawproject 复制后在此基础上二开）
├── public/
├── package.json
└── ...
```

### 1.2 基线建立步骤（Phase 0）

```bash
# 1. 复制上游代码作为开发基线（排除依赖与构建产物）
rsync -av --exclude='node_modules' --exclude='.git' \
      rawproject/ ./

# 2. 初始化仓库
git init
git add .
git commit -m "chore: bootstrap from magic-resume v2.0.8"

# 3. 安装依赖并验证基线可构建
pnpm install
pnpm build
```

**验证标准**：`pnpm dev` 能启动，浏览器打开 `http://localhost:3000` 能看到首页，能进入工作台并成功导出一份 PDF。

**为什么必须先验证基线**：后续任何报错都必须能区分「上游遗留问题」与「新引入问题」。跳过这一步，调试成本会成倍增加。

### 1.3 Git 策略

| 项 | 约定 |
|---|---|
| 提交粒度 | 一个功能点一个提交，避免把不相关的改动混在一起 |
| 提交信息 | Conventional Commits（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`） |
| 分支 | `main` 为稳定分支；每个 Phase 开一个特性分支，完成后合并 |
| `rawproject/` | 永不提交，已加入 `.gitignore` |
| 上游同步 | 若需跟进上游更新，手动对比 `rawproject/` 与本地代码，不做自动 merge |

---

## 2. 阶段划分

```
Phase 0  基线建立                    ── 0.5 天
Phase 1  职业数据库内核               ── 2 天    ← 无 UI，纯数据层，可单测
Phase 2  数据库 UI + 通用简历         ── 3 天    ← 里程碑 M1，此时即可实用
Phase 3  LLM 智能匹配 + 目标简历      ── 3.5 天  ← 核心价值，M2
Phase 4  版本管理 + 备份              ── 1.5 天
Phase 5  打磨与验收                   ── 1 天
```

**设计原则**：每个 Phase 结束时项目都处于**可运行、可演示**的状态。不允许出现「做完 Phase 3 才能跑」的情况。

---

## 3. Phase 0 — 基线建立

### 3.1 任务

| 编号 | 任务 | 验收 |
|---|---|---|
| T0-1 | 复制上游代码到仓库根目录 | `src/` 等目录就位 |
| T0-2 | `git init` + 首次提交 | `git log` 有记录，`rawproject/` 不在版本控制中 |
| T0-3 | `pnpm install` | 依赖安装成功 |
| T0-4 | `pnpm build` | 构建成功，无报错 |
| T0-5 | `pnpm dev` 手工验证 | 首页可访问、工作台可用、PDF 可导出 |
| T0-6 | 记录基线快照 | 截图存 `docs/assets/baseline/` |

### 3.2 风险

| 风险 | 应对 |
|---|---|
| Node 版本不兼容（本项目 Node v22.22.3） | 上游 `package.json` 未固定 `engines`，若报错检查各依赖的 Node 要求 |
| 上游代码存在未提交的本地修改 | 已确认 `rawproject/` 是干净下载，无 `.git` |
| 字体文件缺失导致 PDF 导出异常 | `public/fonts/` 下有 11 个字体文件，验证导出时确认中文字体正常 |

---

## 4. Phase 1 — 职业数据库内核

**目标**：数据层完整可用，通过单元测试验证，不涉及任何 UI。

### 4.1 任务

| 编号 | 文件 | 新建/修改 | 预估行数 | 说明 |
|---|---|---|---|---|
| T1-1 | `src/config/sectionIds.ts` | 新建 | ~40 | 板块 id 常量，数据库与简历层共用 |
| T1-2 | `src/types/profile.ts` | 新建 | ~180 | `CareerProfile` / `ProfileEntity` / `SkillGroup` / `SectionDef` |
| T1-3 | `src/types/resume.ts` | 修改 | +45 | 追加 `sourceMap` / `snapshot`（纯加法，旧数据零迁移） |
| T1-4 | `src/config/profilePresetSections.ts` | 新建 | ~90 | 10 个预设板块定义 + 基本信息扩展字段预设 |
| T1-5 | `src/store/useCareerProfileStore.ts` | 新建 | ~320 | zustand + persist，含 CRUD、排序、批量导入 |
| T1-6 | `src/lib/profile/entityUtils.ts` | 新建 | ~150 | 日期解析、字段完整度计算、条目校验 |
| T1-7 | `src/lib/imageStore.ts` | 新建 | ~180 | IndexedDB 图片存储（解决 localStorage 配额） |
| T1-8 | `src/lib/profile/materialize.ts` | 新建 | ~280 | 物化：Profile → ResumeData |
| T1-9 | `src/config/algorithmConfig.ts` | 新建 | ~70 | 全部可调参数集中管理 |
| T1-10 | `src/lib/profile/rankGeneric.ts` | 新建 | ~90 | 时效 × 同类衰减排序（纯函数） |
| T1-11 | `vitest.config.ts` + 测试文件 | 新建 | ~400 | 单元测试 |

**总计**：约 1900 行（含测试）

### 4.2 关键实现要求

**T1-5 `useCareerProfileStore`** —— 文件会超过 400 行，需按职责拆分：

```
src/store/useCareerProfileStore.ts        # store 定义与导出（~150 行）
src/store/profile/entityActions.ts        # 条目 CRUD（~120 行）
src/store/profile/skillActions.ts         # 技能组 CRUD（~60 行）
src/store/profile/basicActions.ts         # 基本信息（~50 行）
```

**T1-8 `materialize`** —— 必须满足：

- 纯函数：不读全局状态、不调用 `Date.now()`
- 空数据处理：数据库中某个板块无条目时，产出空数组而非 `undefined`
- `sourceMap` 完整性：每一个产出条目的 id 都能在 `sourceMap` 中找到对应
- 技能组转富文本的 HTML 结构必须与上游 `initialResumeData.ts` 的 `skillContent` 一致

**T1-11 测试** —— 引入 vitest（上游无测试框架）：

```bash
pnpm add -D vitest
```

测试覆盖要求见 [03-generation-algorithm.md](./03-generation-algorithm.md) §8.1。

### 4.3 验收标准

```bash
# 类型检查通过
pnpm tsc --noEmit

# 单元测试全部通过
pnpm vitest run

# 手工验证：在浏览器控制台执行
# （临时暴露 store 到 window）
window.__profile.addEntity({...})
window.__profile.materializeToResume()   # 产出的对象结构合法
```

### 4.4 风险

| 风险 | 应对 |
|---|---|
| `materialize` 产出的数据无法通过模板渲染 | 参考 `rawproject/src/config/initialResumeData.ts` 的完整示例，逐字段比对 |
| 图片迁移 IndexedDB 后导出 PDF 异常 | 上游 `export.ts` 的 `optimizeImages` 处理的是 DOM 中的图片；确保 `idb:` 引用在渲染前已解析为 `blob:` URL |
| zustand persist 版本冲突 | 使用新的 storage key `career-profile-storage`，与上游 `resume-storage` 隔离 |

---

## 5. Phase 2 — 数据库 UI + 通用简历生成

**目标**：用户能建立数据库、生成第一份通用简历。这是第一个可交付里程碑。

### 5.1 任务

| 编号 | 文件 | 新建/修改 | 预估行数 | 说明 |
|---|---|---|---|---|
| T2-1 | `src/app/app/dashboard/profile/ProfileWorkbench.tsx` | 新建 | ~200 | 数据库主界面，左侧板块 Tab |
| T2-2 | `src/app/app/dashboard/profile/ProfileSidebar.tsx` | 新建 | ~120 | 板块导航 |
| T2-3 | `src/app/app/dashboard/profile/EntityList.tsx` | 新建 | ~220 | 条目列表，支持拖拽排序、显示/隐藏 |
| T2-4 | `src/app/app/dashboard/profile/EntityEditor.tsx` | 新建 | ~280 | 条目编辑表单（内容字段 + 提示字段） |
| T2-5 | `src/app/app/dashboard/profile/TagsInput.tsx` | 新建 | ~120 | tags / skills / metrics 标签式输入（首个标签即类别） |
| T2-6 | `src/app/app/dashboard/profile/BasicPanel.tsx` | 新建 | ~240 | 基本信息（含政治面貌等预设字段） |
| T2-7 | `src/app/app/dashboard/profile/SkillGroupPanel.tsx` | 新建 | ~120 | 技能组编辑（组名 + 内容文本） |
| T2-8 | `src/app/app/dashboard/profile/CustomSectionPanel.tsx` | 新建 | ~160 | 校园经历 / 荣誉课程 / 语言能力 |
| T2-9 | `src/app/app/dashboard/profile/ImportWizard.tsx` | 新建 | ~260 | PDF 导入 + 逐条确认 |
| T2-10 | `src/app/app/dashboard/profile/GenerateGenericModal.tsx` | 新建 | ~280 | 通用简历生成预览与确认 |
| T2-11 | `src/app/app/dashboard/client.tsx` | 修改 | +30 | 导航加入「职业数据库」入口 |
| T2-12 | `src/routes/app/dashboard/profile.tsx` | 新建 | ~10 | 路由注册 |
| T2-13 | `src/i18n/locales/zh.json` | 修改 | +80 | 新增文案 |
| T2-14 | `src/store/useResumeStore.ts` | 重构 | — | 按职责拆分（见 §5.2） |

**总计**：约 2100 行

### 5.2 T2-14 重构说明

上游 `useResumeStore.ts` 已达 **1012 行**，超出项目规范（200-400 行）。在加入新功能前先拆分：

```
src/store/useResumeStore.ts              # store 定义与持久化（~200 行）
src/store/resume/crudActions.ts          # 增删改查（~180 行）
src/store/resume/sectionActions.ts       # 板块操作（~150 行）
src/store/resume/settingActions.ts       # 全局设置（~100 行）
src/store/resume/historyActions.ts       # 撤销重做（~120 行）
```

**重构要求**：纯搬运，不改变任何行为。重构后必须先验证所有既有功能正常，再开始加新功能。

**风险**：重构引入回归。应对方式是**单独一个提交**完成重构，重构提交与功能提交分离，便于定位问题。

### 5.3 验收标准

1. 能在「职业数据库」页面完整录入：基本信息、教育经历、经历、项目、技能、证书、校园经历
2. `tags` / `skills` / `metrics` 由 `extract*()` 自动填充，用户可编辑
3. 点击「生成通用简历」，能看到预览（左侧条目清单，右侧简历渲染）
4. 调整选中项后确认，生成一份简历并跳转到工作台
5. 工作台能切换模板、调整字体、导出 PDF
6. **上游既有功能全部正常**（简历列表、导入、AI 润色、语法检查）

### 5.4 风险

| 风险 | 应对 |
|---|---|
| 自定义板块不渲染 | 检查 `menuSections` 中是否存在对应 id 且 `enabled: true` |
| 技能组转富文本后样式错乱 | 与 `initialResumeData.ts` 的 `skillContent` 结构逐字符比对 |
| store 重构引入回归 | 独立提交 + 全功能手工回归 |
| 数据库 UI 与上游工作台 UI 风格不一致 | 复用上游的 `src/components/ui/*` 组件与 Tailwind 变量 |

---

## 6. Phase 3 — LLM 智能匹配 + 目标简历生成

**目标**：核心差异化功能落地。

**v2.0 变更**：原「5 维确定性打分 + AI 微调」方案已废弃，改为纯 LLM 语义分析。设计依据见 [03-generation-algorithm.md](./03-generation-algorithm.md)。

### 6.1 任务

| 编号 | 文件 | 新建/修改 | 预估行数 | 说明 |
|---|---|---|---|---|
| T3-1 | `src/types/jobTarget.ts` | 新建 | ~120 | `JobTarget` / `MatchLevel`(二值) / `MatchAnalysis` / `AnalysisCache` |
| T3-2 | `src/store/useJobTargetStore.ts` | 新建 | ~220 | 投递目标 CRUD + 分析结果读写 |
| T3-3 | `src/lib/match/buildMatchPrompt.ts` | 新建 | ~180 | **提示词构造（纯函数，必须逐字节确定）** |
| T3-4 | `src/lib/match/validateMatchResult.ts` | 新建 | ~200 | 结果校验：id 合法性、等级枚举、**evidence 子串自洽（不举证则提升为推荐）** |
| T3-5 | `src/lib/match/fingerprint.ts` | 新建 | ~120 | 内容指纹计算 + 变更定位 |
| T3-6 | `src/lib/match/analysisCache.ts` | 新建 | ~150 | 指纹比对、缓存命中判定、失效提示生成 |
| T3-7 | `src/lib/match/analyzeMatch.ts` | 新建 | ~260 | 编排：缓存 → 构造 → 调用 → 校验 → 存储 → 降级 |
| T3-9 | `src/lib/match/computeTopN.ts` | 新建 | ~50 | 依据 `rankedIds` 计算 top-N 归属（仅标记优先级） |
| T3-9b | ~~`src/lib/match/provider.ts`~~ | — | — | **已删除**：一个接口一个实现，YAGNI |
| T3-11 | `src/routes/api/match.ts` | 新建 | ~180 | 分析路由（仅 DeepSeek，含 prompt 注入与降级，无独立抽象层） |
| T3-12 | `src/app/app/dashboard/targets/TargetList.tsx` | 新建 | ~200 | 投递目标列表 |
| T3-13 | `src/app/app/dashboard/targets/TargetEditor.tsx` | 新建 | ~220 | JD 录入（含本地质量检查） |
| T3-14 | `src/app/app/dashboard/targets/CandidateList.tsx` | 新建 | ~300 | **候选清单（核心交互，勾选状态由用户产生）** |
| T3-15 | `src/app/app/dashboard/targets/MatchItemCard.tsx` | 新建 | ~190 | 单条目的推荐标记、★优先角标、理由、依据、勾选框 |
| T3-16 | `src/app/app/dashboard/targets/CoveragePanel.tsx` | 新建 | ~180 | 覆盖度报告（covered / weak / missing） |
| T3-17 | `src/app/app/dashboard/targets/AnalysisBanner.tsx` | 新建 | ~140 | 模型信息、分析时间、重新分析按钮、变更提示 |
| T3-18 | `src/app/app/dashboard/targets/SectionPicker.tsx` | 新建 | ~180 | 勾选要展示的板块 + 拖拽排序 + 页数提示与「仅保留 ★」 |
| T3-19 | `src/app/app/dashboard/targets/TargetedWizard.tsx` | 新建 | ~260 | 向导容器（分析 → 勾选条目 → 勾选板块 → 生成） |
| T3-20 | `src/routes/app/dashboard/targets.tsx` | 新建 | ~10 | 路由注册 |
| T3-21 | `src/i18n/locales/zh.json` | 修改 | +90 | 新增文案 |
| T3-22 | 测试文件 | 新建 | ~550 | prompt 确定性、校验、top-N、缓存、降级 |

**总计**：约 3400 行

**较 v1.0 删除的文件**（不再需要）：`skillDictionary.ts`、`synonyms.ts`、`tokenize.ts`、`idf.ts`、`scoreMatch.ts`、`aiAdjust.ts`、`parseJDLocal.ts`、`parseJDWithAI.ts`、`verifyFacts.ts`、`tailor.ts` —— 约 1900 行。

### 6.2 关键实现要求

**T3-3 `buildMatchPrompt` —— 最高优先级**

必须是纯函数，且**同一输入调用 100 次输出逐字节相同**。这是可复现性的第二道防线。

| 要求 | 原因 |
|---|---|
| 不调用 `Date.now()` / `Math.random()` | 时序依赖会破坏确定性 |
| 显式排序，不用 `Object.keys()` 顺序 | JS 对象对整数键有特殊排序行为 |
| 条目顺序：板块 → `endTimestamp` 降序 → `id` 升序 | 不依赖数据库的插入顺序（用户可能拖拽过） |
| `description` 统一空白符与去首尾 | HTML 中的换行缩进差异会进入 prompt |
| 固定小数位与单位，不用 `toLocaleString` | locale 差异会产生不同字符串 |

**这一项必须写单元测试直接断言**，不能靠人工检查。

**T3-4 `validateMatchResult` —— 可复现性的核心机制**

`evidence` 子串自洽校验是把提示词中的软约束变成程序硬约束的关键。规则：`level` 为 `not_recommended` 时，`evidence` 必须非空**且**能在该条目 `description` 的纯文本中找到（忽略空白差异）。否则**自动提升为 `recommended`**。

**举证责任在「否定」一侧** —— 判为推荐不需要举证（宁可多推荐），判为不推荐必须举证。既防止模型随手丢弃用户的经历，也让 `evidence` 的 token 成本落在一半的条目上。

**不依赖模型是否听话** —— 引用不出原文就降级，这是程序保证的，不是提示词保证的。

**T3-6 `analysisCache` —— 让「低频不可复现」变成「零频」**

指纹一致时直接复用结果，不发请求。`contentFingerprint` 由「全部条目内容字段 + JD 正文」哈希得出，包含 `modelId` 与 `promptVersion`。

变更时**提示而非自动重跑**（见 [02-data-model.md](./02-data-model.md) Q5）。

**T3-7 降级编排 —— 所有失败路径都必须产出可用结果**

| 情况 | 行为 |
|---|---|
| 未配置 API Key | 进入手动选择模式，界面不显示任何等级标签 |
| 超时 | 重试 1 次（指数退避）→ 无标注 |
| 非法 JSON | 重试 1 次（附格式纠正提示）→ 无标注 |
| 校验后有效条目 < 50% | 保留已通过部分作为标注 |
| HTTP 429 / 鉴权失败 | 不重试，无标注 + 错误摘要 |

写完后需专项测试：断开网络、填错 Key、返回空结果、返回非法 JSON，**四种情况都要能生成简历**。

**T3-14 候选清单 —— 产品的核心交互**

- 每个条目展示：推荐标记 + `★ 优先` 角标（仅 top-N）、理由；不推荐的展开显示 `evidence`
- **未推荐的条目也要展示**，标注理由，不允许静默隐藏
- **勾选框初始状态为空** —— AI 不预设任何勾选
- **默认排序按板块 + 时间，不按 LLM 输出顺序**（LLM 本来就不输出顺序）
- 提供「全选推荐项」「清空」两个便捷按钮
- 手动调整过的条目要有「已手动调整」标记
- 无标注状态下**不渲染任何标记区块**，但勾选与生成功能完全不变

### 6.3 验收标准

1. 能新建投递目标，粘贴 JD（含本地质量检查提示）
2. 点击「智能分析」后看到每条经历的推荐标记、理由；不推荐的展开显示逐字依据
3. 最推荐的前 5 条带 `★ 优先` 角标
4. **所有条目的勾选框初始为空**，AI 不预设任何勾选状态
5. 能一键「全选推荐项」，也能逐条手动勾选
6. 能勾选要展示的板块并拖拽排序
7. 点击生成 → 系统按勾选物化简历 → 跳转工作台
8. **prompt 确定性测试通过**：同一输入 100 次调用输出逐字节相同
9. **稳定性测试通过**（仅 DeepSeek）：
   - 推荐集合 10 次运行 Jaccard ≥ 0.80
   - top-N 集合 10 次运行 Jaccard ≥ 0.70
   - 推荐条目数极差 ≤ 3
10. **缓存测试通过**：数据未变时不发请求，结果逐字段相同
11. **降级测试通过**：五种失败场景下候选清单可用、勾选可用、简历能生成
12. 未配置 API Key 时，候选清单正常渲染（仅无标注）

### 6.4 风险

| 风险 | 应对 |
|---|---|
| 模型不遵守 evidence 要求，大量 `not_recommended` 被提升为推荐 | 观察提升率；若 > 40% 说明提示词对证据的要求不够明确，调整措辞（而非放宽校验） |
| 推荐集合稳定性达不到 Jaccard ≥ 0.80 | 检查提示词是否存在歧义表述；确认 temperature 与 seed 已正确注入 |
| top-N 稳定性达不到 0.70 | top-N 依赖排序，波动天然更大。可考虑改为「按 `rankedIds` 前 N 个中的推荐条目」而非「前 N 个推荐条目」，减小边界效应 |
| 长上下文尾部条目判断质量下降 | 超过 30 条时启用两阶段粗筛（v1 预留 `twoStageThreshold`，不实现） |
| 成本超预期 | 指纹缓存是主要手段；其次限制单条描述的字符数（`descriptionMaxChars`） |
| 推荐条目过多导致用户勾选负担重 | 「全选推荐项」按钮降低操作成本；top-N 角标提供优先级参考 |
| 候选清单在条目多时界面拥挤 | 默认按板块折叠；不推荐条目默认收起 |

---


## 7. Phase 4 — 版本管理 + 备份

### 7.1 任务

| 编号 | 文件 | 新建/修改 | 预估行数 | 说明 |
|---|---|---|---|---|
| T4-1 | `src/app/app/dashboard/resumes/resumeListModel.ts` | 新建 | ~200 | 简历列表数据模型（按投递目标分组 + 版本分组） |
| T4-2 | `src/app/app/dashboard/resumes/ResumeCardItem.tsx` | 修改 | +60 | 展示公司/岗位/版本号 |
| T4-3 | `src/app/app/dashboard/resumes/ResumeWorkbench.tsx` | 修改 | +80 | 分组视图切换 |
| T4-4 | `src/app/app/dashboard/targets/TargetDetail.tsx` | 新建 | ~220 | 投递目标详情（含版本列表） |
| T4-5 | `src/utils/backup.ts` | 新建 | ~260 | 全库导出 / 导入（覆盖 + 合并） |
| T4-6 | `src/app/app/dashboard/settings/BackupPanel.tsx` | 新建 | ~220 | 备份界面 + 超期提醒 |
| T4-7 | `src/app/app/dashboard/workbench/DiffView.tsx` | 新建 | ~280 | 原文/改写差异对照（FR-EDIT-02-2） |
| T4-8 | `src/app/app/dashboard/workbench/SourceBadge.tsx` | 新建 | ~120 | 「来自数据库」标识 + 同步按钮（FR-EDIT-02-1 / FR-EDIT-03） |
| T4-9 | `src/app/app/workbench/[id]/page.tsx` | 修改 | +40 | 集成差异对照与来源标识 |

**总计**：约 1480 行

### 7.2 验收标准

1. 简历列表能区分通用简历与目标简历，目标简历显示公司、岗位、版本号
2. 能按投递目标分组查看，同一目标下的多份简历按时间倒序展示为 v1/v2/v3
3. 对同一投递目标重新生成时**创建新版本而非覆盖**，旧版本仍可访问
4. 投递目标详情页能看到该目标下生成的所有简历版本
5. 全库导出的 JSON 在另一台机器导入后，数据库、简历、投递目标三者关联完整
6. 导入支持「覆盖」与「合并」两种模式，覆盖前有二次确认
7. 距上次备份超过 7 天时显示提醒
8. 目标简历能查看原文/改写差异，可逐段接受或拒绝
9. 编辑面板中来自数据库的条目有明确标识，且默认修改**不影响数据库**
10. 点击「同步回数据库」后才更新数据库，界面对此有明确反馈

### 7.3 风险

| 风险 | 应对 |
|---|---|
| 导入合并时 id 冲突 | 合并模式下为导入的实体生成新 id，并重建 `sourceMap` |
| 全库 JSON 体积过大（含图片） | 图片走 IndexedDB 不导出；JSON 中只含引用，导出时提示「图片未包含在备份中」 |
| 差异对照的段落对齐不准 | 使用基于行的 LCS diff，按 `<li>` 粒度对齐而非按字符 |
| 版本数量增长导致列表过长 | 默认只展示每个投递目标的最近 3 个版本，其余折叠 |
| 用户误以为编辑已同步到数据库 | 来源标识必须显著；「同步回数据库」按钮点击后给出明确 toast 反馈 |

---

## 8. Phase 5 — 打磨与验收

### 8.1 任务

| 编号 | 任务 |
|---|---|
| T5-1 | 用真实简历数据端到端跑通全流程 |
| T5-2 | 性能验证：缓存命中时候选清单加载 < 100ms；LLM 分析 < 60s |
| T5-3 | 提示词调优（用真实数据核对等级判断合理性）；稳定性测试 Jaccard ≥ 0.80 |
| T5-4 | 空状态、加载态、错误态检查 |
| T5-5 | 移动端可用性检查（至少查看与简单编辑可用） |
| T5-6 | 更新 README，说明本项目与上游的关系 |
| T5-7 | 补充 `docs/` 下的验收记录 |

### 8.2 最终验收清单

- [x] 能用一份 PDF 简历导入并建立完整职业数据库 —— 原本落到**简历**层（上游设计），已改为落到职业数据库；端到端实测教育/工作/项目/技能/基本信息全部入库
- [ ] 能生成通用简历并导出 PDF
- [x] 能针对具体 JD 生成目标简历，看到**名次、理由与要求项覆盖判定** —— 原措辞是「等级 + 逐字证据」，两样都已被有意替换：
  - 「等级」在 prompt v4 移除：该在哪划线取决于用户这份简历放得下几条，模型无从知道，于是划线交给代码、名额交给用户（docs/03 §3.6）
  - 「逐字证据」在 v5 由 `sourceQuote`（这条要求的 JD 原文依据）+ `entityIds`（支撑它的具体经历）取代，可核对性没有丢，换了个更细的落点
- [ ] 数据未变时匹配结果零变化（指纹缓存生效）
- [ ] 未配置 API Key 时手动选择模式可用
- [x] 事实校验对抗测试通过 —— **没有单独的「对抗套件」**，保护落在三条校验规则上，各自有单测：编造技能（找不到出处就丢弃）、编造原文依据（JD 里找不到就清空）、声称覆盖却指不出经历（降级为 weak）；量化出口是评测里的「理由幻觉率」（实测 0.8%）。
  - **已知一处拦不住的缺口**：声称 covered 且指向一条**真实却无关**的经历 —— 校验只查经历存不存在，不查它与这条要求有没有关系。已用一条测试把这个洞钉住，说明见 docs/07
- [ ] 能管理工作台的全部编辑能力（模板、字体、布局、板块顺序）
- [ ] 能管理多个简历版本，按投递目标分组
- [ ] 能全库备份与恢复
- [ ] 未配置 API Key 时核心功能仍可用
- [ ] 上游既有功能无回归

---

## 9. 开发规范

### 9.1 代码规范

遵循 `~/.claude/rules/coding-style.md`：

| 规则 | 要求 |
|---|---|
| 文件行数 | 200-400 行，超过 400 必须拆分 |
| 类型标注 | 所有函数必须有类型标注 |
| 不可变性 | 配置对象用 `as const` 或 `readonly` |
| 错误处理 | 捕获具体异常类型，禁止裸 `except`（TS 中禁止空 catch） |
| 命名 | 组件 `PascalCase`，函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE` |
| 日志 | 禁止 `console.log` 调试语句；使用统一的 logger |
| 嵌套 | 不超过 4 层 |

### 9.2 新增文件的目录约定

```
src/types/          # 类型定义
src/config/         # 常量与配置
src/store/          # zustand store
src/lib/<domain>/   # 纯逻辑（无 React 依赖）
src/components/     # 可复用组件
src/app/app/...     # 页面级组件
src/routes/         # 路由注册（薄封装）
```

**`src/lib/` 下的代码必须是无 React 依赖的纯逻辑**，这样才能被单元测试直接覆盖。

### 9.3 验证命令

```bash
pnpm tsc --noEmit      # 类型检查
pnpm vitest run        # 单元测试
pnpm build             # 构建
pnpm dev               # 本地运行
```

**每个 Phase 结束都必须跑通前三个命令。**

---

## 10. 已知风险与边界

### 10.1 许可证

**Magic Resume 采用 Apache 2.0 + 附加商业限制条款。** 原文（`rawproject/LICENSE`）关键点：

| 场景 | 是否需要商业授权 |
|---|---|
| 个人非商业使用（做自己的简历） | ✅ 免费 |
| 二次开发后用于商业运营 | ⚠️ 需要授权 |
| 作为 SaaS / 网站工具向公众提供 | ⚠️ 需要授权 |
| 嵌入企业内部业务系统 | ⚠️ 需要授权 |

**本项目当前定位为个人自用求职工具，属于免费范围。** 若未来有商业化意图，需先联系上游作者获取授权。

### 10.2 技术边界

| 边界 | 说明 |
|---|---|
| 浏览器兼容 | File System Access API 仅 Chrome/Edge 支持，Firefox/Safari 下降级 |
| localStorage 配额 | 图片必须迁 IndexedDB，否则 5MB 配额会被撑爆 |
| AI 依赖 | 需要用户自备 API Key；无 Key 时目标简历的改写功能降级为「使用原文」 |
| 上游同步 | 不做自动 merge，上游更新需手动对比移植 |

### 10.3 产品边界

| 边界 | 说明 |
|---|---|
| 不编造事实 | 这是硬约束，宁可产出未优化的原文，也不产出优化过但失真的内容 |
| 不自动投递 | 不做自动化投递，避免被平台判定为作弊 |
| 不做云端 | v1 不做账号体系与多设备同步 |
| 只服务国内市场 | 不做英文简历、ATS 解析、Action Verb 优化 |

---

## 11. 工时汇总

| 阶段 | 预估工时 | 累计 | 交付物 |
|---|---|---|---|
| Phase 0 | 0.5 天 | 0.5 天 | 可运行的基线 |
| Phase 1 | 2 天 | 2.5 天 | 数据层 + 单测 |
| Phase 2 | 3 天 | 5.5 天 | **数据库 UI + 通用简历（里程碑 M1）** |
| Phase 3 | 3.5 天 | 9 天 | **LLM 智能匹配 + 目标简历（核心价值，M2）** |
| Phase 4 | 1.5 天 | 10.5 天 | 版本管理 + 备份 |
| Phase 5 | 1 天 | 11.5 天 | 验收完成 |

**总计约 11.5 个工作日**（按单人全职估算，不含需求变更与调试外的时间）。

**v1.0 → v2.0 工时变化**：Phase 3 从 4 天降至 3.5 天。虽然新增了稳定性工程（prompt 确定性、指纹缓存、证据校验），但删掉了技能词典、同义词表、分词器、IDF、5 维打分、事实校验等约 1900 行算法代码，净减少约 800 行。

**里程碑**：
- **M1（第 5.5 天）**：能建立数据库并生成通用简历 —— 此时产品已有实用价值，可开始实际使用
- **M2（第 9 天）**：能针对 JD 做 LLM 推荐标注，用户勾选后生成目标简历 —— 核心价值达成
- **M3（第 11.5 天）**：完整的版本管理与备份 —— 产品完备

### 11.1 分阶段可用性

| 阶段完成后 | 能用它做什么 |
|---|---|
| Phase 2 结束 | 建立职业数据库、生成通用简历、导出 PDF、投递（手动调整内容） |
| Phase 3 结束 | 针对具体 JD 做智能匹配、看到等级与理由、覆盖度分析 |
| Phase 4 结束 | 管理多版本、按投递目标分组、全库备份 |

**Phase 2 结束时产品就能真实使用** —— 这是刻意的设计。即使 Phase 3 因故延后，前三周投入也不会白费。

---

## 12. 开工前置条件

开始 Phase 0 之前，需确认：

- [x] PRD 评审通过（[01-PRD.md](./01-PRD.md) §7 的 4 个决策已关闭）
- [x] 数据模型评审通过（[02-data-model.md](./02-data-model.md) §10 的 5 个决策已关闭）
- [x] 匹配方案评审通过（[03-generation-algorithm.md](./03-generation-algorithm.md) 的 LLM 方案与稳定性设计已确认）
- [x] 确认上游许可证边界（个人自用范围内）
- [x] 确认本地环境：Node v22.22.3 ✅、pnpm 10.3.0 ✅（均满足 Node ≥ 20、pnpm ≥ 9）

**所有前置条件已满足，可以开始 Phase 0。**

### 12.1 决策摘要（实现时直接引用）

| 决策 | 结论 |
|---|---|
| 目录策略 | `rawproject/` 只读参考，开发代码复制到根目录 |
| 数据库分组 | 不分组，建一份全景，每次生成时自动筛选 |
| 板块作用域 | 数据库全量可编辑，简历决定展示哪几个板块 + 顺序 |
| 新增板块实现 | 政治面貌/作品链接走已有通道；校园经历/荣誉课程/语言能力走 `customData` |
| JD 录入 | 粘贴正文 + 手动补公司名，**不做解析** |
| 求职市场 | 国内为主（中文、照片默认开、政治面貌为预设板块、一页优先） |
| 版本组织 | JobTarget 投递目标 + 简历快照 |
| 重复生成 | 每次新建版本，不覆盖 |
| 技能形式 | 纯文本列表，不使用熟练度进度条 |
| 编辑作用域 | 默认仅改本份简历，手动点按钮才同步回数据库 |
| 备份方式 | 浏览器内 JSON 导入导出 |
| 简历对比视图 | v1 不做 |
| **匹配方式** | **纯 LLM 语义判断，不做确定性打分** |
| **AI 角色** | **推荐者，不是决策者** —— 只标注推荐/不推荐与 top-N，不参与生成 |
| **匹配输出** | **二值（推荐/不推荐）+ top-N 标记 + 理由 + 否定依据** |
| **生成路径** | **唯一路径：用户勾选 → 物化**。不存在自动放入的条目 |
| **勾选状态** | **完全由用户产生，AI 不预设默认勾选** |
| **top-N 语义** | **★ 优先只表示优先级，不表示资格**；未入选的推荐条目同样是推荐 |
| **超出页数** | **目标简历不自动删减**，只提示并提供需用户点击的「仅保留 ★」 |
| **排序归属** | **LLM 顺序仅用于算 top-N；UI 按板块 + 时间排序** |
| **可复现性** | **四道防线：二值判断 / prompt 逐字节确定 / temperature=0+seed / 指纹缓存** |
| **数据未变时** | **不重跑，结果零变化；变更时提示而非自动重跑** |
| **无 API Key 时** | **候选清单照常可用，仅无推荐标注**；生成路径不变 |
| **模型** | **v1 锁定 DeepSeek**（`deepseek-chat`, temp 0, seed 42） |
| **匹配字段** | `tags`/`skills`/`metrics` 保留但系统不填充，LLM 直读描述 |
| **类别** | `tags[0]` 即类别，用于通用简历排序的同类衰减 |
| **通用排序** | **时效 × 同类衰减**（λ=0.5），不设板块上限；顺序可验证但不必可预测 |
| **过度设计已清理** | 删除 `MatchProvider` 接口、`aiClient.ts` 抽象层、`skillTags` / `qualityScore` 死字段、`selectEntities` 约束求解器 |
