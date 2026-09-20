# 交互矩阵（逐控件）

> 配套 [feature-inventory.md](feature-inventory.md)。这里放**逐控件**的交互明细，那边放页面 / API / 数据 / 判定。
> 状态口径：`已接线` = 有真实副作用；`死代码` = 无调用方或被读；`TODO` = 源码明确标注未实现；`禁用` = 有 `disabled` 或守卫。
> 所有行号用 `grep -n` 核过。编辑器部分由子代理盘点后**抽样复核**（见文末「复核记录」）。

---

## 一、简历编辑器 `/app/workbench/$id`

### 1.1 编辑器头部 [EditorHeader.tsx](src/components/editor/EditorHeader.tsx)

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| Logo 文字「职光简历」 | :90 | 点击 | `router.push("/app/dashboard")` | 已接线 |
| 简历名称 Input | :100-108 | 输入/失焦 | `updateResumeTitle(value \|\| "未命名简历")` | 已接线（硬编码兜底） |
| 撤销（Undo2） | :119-128 | 点击 | `undo()`，`disabled={!canUndo()}` | 已接线 |
| 重做（Redo2） | :136-145 | 点击 | `redo()`，`disabled={!canRedo()}` | 已接线 |
| Cmd/Ctrl+Z | :62-66 | 键盘 | `undo()`，`isEditableTarget` 守卫 | 已接线 |
| Cmd/Ctrl+Shift+Z、Ctrl+Y | :68-71 | 键盘 | `redo()` | 已接线 |
| ThemeToggle | :151 | 点击 | 明暗主题下拉（menu 模式） | 已接线 |
| 导出（PdfExport） | :153 | 点击 | 打开导出 Dialog | 已接线 |

**头部**没有保存按钮、没有打印按钮、没有返回图标 —— 持久化靠 [useSavesMirror](src/hooks/useSavesMirror.ts) 自动镜像（防抖 1500ms）。

### 1.2 样式面板 [SidePanel.tsx](src/components/editor/SidePanel.tsx)

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| 添加模块（虚线按钮） | :190-197 | 点击 | 开 Popover | 已接线 |
| 标准模块条目 | :203-221 | 点击 | `updateMenuSections` + `setActiveSection` | 已接线 · **标题 i18n 缺失，见 inventory P0#1** |
| 添加自定义模块 | :230-236 | 点击 | `createCustomSection(sectionId)` | 已接线 |
| 自定义颜色（ColorPicker） | :248-269 | 取色 | `debouncedSetColor`(100ms) → `setThemeColor` | 已接线 |
| 预设主题色圆点 | :274-289 | 点击 | `setThemeColor(preset)` | 已接线 |
| 字体 Select | :301-330 | 下拉 | `updateGlobalSettings({ fontFamily })` | 已接线 |
| 行高 Slider (1–2) | :342-350 | 拖拽 | `updateGlobalSettings({ lineHeight })` | 已接线 |
| 基础字号 Select | :361-390 | 下拉 | `updateGlobalSettings({ baseFontSize })` | 已接线 |
| 模块标题字号 Select | :397-426 | 下拉 | `updateGlobalSettings({ headerSize })` | 已接线 |
| 模块项一级标题字号 Select | :433-462 | 下拉 | `updateGlobalSettings({ subheaderSize })` | 已接线 |
| 页边距 Slider / Input / ± 按钮 | :475-555 | 拖拽/输入/点击 | `updateGlobalSettings({ pagePadding })`，Input 有 0–100 守卫 | 已接线 |
| 模块间距 同上 | :570-652 | 同上 | `updateGlobalSettings({ sectionSpacing })`，1–100 | 已接线 |
| 段落间距 同上 | :667-749 | 同上 | `updateGlobalSettings({ paragraphSpacing })`，**Input 只挡 >=1 无上限** | 已接线（校验不一致，见 inventory P2#26） |

### 1.3 编辑面板外壳 [EditPanel.tsx](src/components/editor/EditPanel.tsx)

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| 板块标题 Input | :90-110 | 输入 | `updateMenuSections` 就地改 title | 已接线 |
| 板块标题（basic） | :82-87 | — | `activeSection === "basic"` 时渲染**静态 span**，不允许改名 | 已接线（设计如此） |
| Pencil 提示 | :111-120 | 悬停 | 仅 Tooltip，无 onClick | 已接线（无动作） |

### 1.4 通用字段壳 [Field.tsx](src/components/editor/Field.tsx)

被全部面板复用。`label` 为空时 `return null`（:89）。

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| 「至今」Switch | :97-100 | 切换 | `handlePresentToggle`(:75-86) 写 `t("field.toPresent")`；date 型写整值，date-range 型只替换后半段 | 已接线（仅 `showPresentSwitch` 时渲染） |
| date 输入 | :124-130 | 选择 | 委托 `UnifiedDateInput` | 已接线 |
| date-range 输入 | :139-145 | 选择 | 委托 `UnifiedDateRangeInput` | 已接线 |
| textarea / 富文本 / input | :153-194 | 输入 | 各 `onChange` | 已接线 |

### 1.5 各板块面板

EditPanel 的 switch 路由表在 [EditPanel.tsx:26-60](src/components/editor/EditPanel.tsx#L26)。

| 面板 | id | 可编辑字段 | 增 | 删 | 排序 | 可见性 | 特殊交互 |
|---|---|---|---|---|---|---|---|
| 基本信息 [BasicPanel](src/components/editor/basic/BasicPanel.tsx) | `basic` | layout / 照片+photoConfig / fieldOrder 各字段值 / 字段图标 / customFields / github×3 | :461 | :362（name,title 不可删）/ :139 | :420、:437（两套 Reorder.Group） | :344、:122 | 无日期选择器；改名被禁用 |
| 教育 [EducationPanel](src/components/editor/education/EducationPanel.tsx) | `education` | school/major/degree/gpa/startDate/endDate/description | :93 | :217-240 | :78 | :204 | **date ×2**（end 带至今）；富文本；**简要模式开关**(:71)；折叠展开；拖拽手柄展开时禁用 |
| 工作 [ExperiencePanel](src/components/editor/experience/ExperiencePanel.tsx) | `experience` | company/position/date/details | :51 | :179 | :39 | :160 | **date-range + 至今**；富文本 |
| 项目 [ProjectPanel](src/components/editor/project/ProjectPanel.tsx) | `projects`（复数） | name/role/link/linkLabel/date/description | :51 | :220 | :39 | :202 | **date-range**；`link`/`linkLabel` 用原生 Input（:61、:72）；**唯一额外写 `setDraggingProjectId` 的板块** |
| 技能 [SkillPanel](src/components/editor/skills/SkillPanel.tsx) | `skills` | 仅 `skillContent` | — | — | — | — | **结构最简**：单个富文本域，无 label 无条目概念 |
| 自我评价 [SelfEvaluationPanel](src/components/editor/self-evaluation/SelfEvaluationPanel.tsx) | `selfEvaluation` | 仅 `selfEvaluationContent` | — | — | — | — | 30 行，无增删排序 |
| 证书 [CertificatesPanel](src/components/editor/certificates/CertificatesPanel.tsx) | `certificates` | url + width | :110 文件 / **:55 粘贴** | :74 | :100 | **无** | 宽度 Slider(10–100, :65)；**Cmd/Ctrl+V 粘贴**（仅该板块生效）；分级压缩(:36-48)；**唯一没有可见性开关的条目板块** |
| 自定义 [CustomPanel](src/components/editor/custom/CustomPanel.tsx) | 其余全部 | title/subtitle/dateRange/description | :50 / :58 | :166 | :37 | :154 | date-range（**无至今开关**）；富文本；campus/honors/languages 等落在这里 |
| 布局（SidePanel 内）[LayoutSetting](src/components/editor/layout/LayoutSetting.tsx) | — | 板块 title/enabled/order/icon + 板块级 centerSubtitle/flexibleHeaderLayout + 全局 useIconMode | :190 | :198-245 | :51（basic 固定首位） | :179 | basic 与其它板块**能力不对称**；显示开关只在选中该板块时展开 |

### 1.6 预览区 [preview/index.tsx](src/components/preview/index.tsx)

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| 点击简历内某板块 | :238（handler :201-215） | 点击(capture) | 读 `[data-resume-section-id]` → `setActiveSection` | 已接线 |
| `PreviewPanelProps` 6 个 props | :15-20 / :59-64 | — | **函数体内零使用** | **死代码**（inventory #16） |
| `startRef` / `previewRef` | :80-81 | — | 挂到 div（:219、:227）但从不读 `.current` | **死代码**（#17） |
| 分页线 PageBreakLine | :23-52, :253-279 | 悬停无效 | `pointer-events-none`，纯视觉，最多 20 条(:257) | 已接线（只读） |
| 一页纸放不下警告 | :162-168 | 自动 | `toast.warning(t("autoOnePage.cannotFit"))` | 已接线 |
| 分页线文案 | :46 | — | `第{pageNumber}页结束` **未走 i18n** | 硬编码 |

### 1.7 悬浮 Dock [PreviewDock.tsx](src/components/preview/PreviewDock.tsx)（`hidden md:flex`）

| 控件 | 行 | 副作用 | 状态 |
|---|---|---|---|
| 切换模板（TemplateSheet） | :116 | 开 Sheet | 已接线 |
| 自动一页纸 toggle | :138-145 | `updateGlobalSettings({ autoOnePage })` + toast | 已接线 |
| 分页线 toggle | :169-178 | `updateGlobalSettings({ pageBreakLinesVisible })` + toast | 已接线 |
| 导出简历 | :190-202 | 开导出 Dialog | 已接线 |
| 复制简历 | :216（:82-99） | `duplicateResume` → `setActiveResume` → toast → `router.push` → rAF + `window.location.assign` 兜底 | 已接线（**双重跳转逻辑**，P2） |
| 展开/收起 侧边栏 / 编辑面板 / 预览面板 | :231 / :260 / :286 | `toggle*Panel()` | 已接线（**接收方不读**，见 #16） |
| 返回仪表盘（Home） | :318 | `router.push("/app/dashboard")` | 已接线 |
| FAQ | :335 | 开 FAQDialog | 已接线 |

### 1.8 移动端 [MobileWorkbench.tsx](src/components/mobile/MobileWorkbench.tsx)

| 控件 | 行 | 副作用 | 状态 |
|---|---|---|---|
| 底部导航 内容/样式/预览 | :144-146 | `setActiveTab` | 已接线（**标签硬编码中文**） |
| 基本信息 chip | :62-73 | `setActiveSection("basic")` | 已接线（硬编码） |
| 其它板块 chip | :79-91 | `setActiveSection(id)`，**只列 enabled 板块** → 隐藏板块在移动端无法编辑 | 已接线（守卫） |
| 3 个空 toggle | :132-135 | `() => {}` | **死代码**（#18） |

### 1.9 富文本工具栏 [RichEditor.tsx](src/components/shared/rich-editor/RichEditor.tsx)

被 6 个面板的 `type="editor"` 字段共用，交互量最大。

| 控件 | 行 | 副作用 |
|---|---|---|
| 加粗 / 斜体 / 下划线 | :563 / :570 / :577 | `toggleBold/Italic/Underline` |
| 左/中/右/两端对齐 | :592 / :599 / :606 / :613 | `setTextAlign` |
| 无序 / 有序列表 | :625 / :632 | `toggleBulletList` / `toggleOrderedList` |
| 撤销 / 重做 | :644 / :651 | `undo` / `redo`，`disabled={!editor.can().undo()}` |
| 文字色 / 高亮色板 | :167-220 / :260-324 | 弹层选色 |
| 链接 添加/移除 | :376-420 | `applyLink`(:420) / `removeLink`(:414) |
| 移动端工具栏（重复一套） | :683-695 | 同上 |

---

## 二、仪表盘各板块

### 2.1 布局层 [client.tsx](src/app/app/dashboard/client.tsx)

| 控件 | 行 | 交互 | 副作用 | 状态 |
|---|---|---|---|---|
| Logo +「职光简历」 | :107 | 点击 | `router.push(\`/${locale}\`)` 回落地页 | 已接线 |
| 6 个侧边栏项 | :144 | 点击 | `router.push(item.url)` | 已接线 |
| 子菜单渲染块 | :157-172 | — | `sidebarItems` **无一项带 `items` 字段** → 永不渲染 | **死代码** |
| `handleItemClick` 的 `if (item.items) {}` | :85-87 | — | **空分支** | **死代码** |
| `collapsible` / `setCollapsible` | :80 | — | `setCollapsible` **全文件仅出现 1 次（就是声明处）** | **死代码** |
| SidebarTrigger | :203 | 点击 | `toggleSidebar()` | 已接线 |
| CurrentUserChip | :191 | 点击 | 开用户选择弹窗 | 已接线 |
| ThemeToggle | :194 | 点击 | `setTheme` + View Transition | 已接线 |

### 2.2 用户选择 [UserSelectDialog.tsx](src/app/app/dashboard/UserSelectDialog.tsx)

| 控件 | 行 | 副作用 | 状态 |
|---|---|---|---|
| 用户卡片 | :56 | `setCurrentUser(userId)` + 关闭 | 已接线 |
| 卡片右上垃圾桶（hover 显现） | :77-80 | `stopPropagation` + `setPendingDelete(id)` | 已接线 |
| 新建用户虚线卡 | :208 | `createUser()` 并自动选中 | 已接线 |
| 删除确认「删除」 | :248 | `useDeleteUser` → `purgeResumes` + `purgeTargets` + `removeUser` | 已接线 |
| 删除确认「取消」 | :246 | `setPendingDelete(null)` | 已接线 |

### 2.3 AI 设置 [ai/page.tsx](src/app/app/dashboard/ai/page.tsx)

**全页只有 2 个输入框 + 1 个外链，没有第三个控件。**

| 控件 | 行 | 副作用 | 状态 |
|---|---|---|---|
| API Key（password） | :58-64 | `setDeepseekApiKey` → persist 即时落 localStorage | 已接线 |
| 「获取 API Key」外链 | :48-56 | `<a href="https://platform.deepseek.com" target="_blank">` | 已接线 |
| 模型（placeholder `deepseek-chat`） | :71-76 | `setDeepseekModelId`，留空回落 `DEFAULT_MODEL` | 已接线 |

**能力边界（源码事实，不是推测）**

| 项 | 可配 | 依据 |
|---|---|---|
| provider | ❌ 硬编码 DeepSeek | `useAIConfigStore` 无 provider 字段；[:85](src/app/app/dashboard/targets/TargetsWorkbench.tsx#L85) 与 [AutoCategorizeButton.tsx:44](src/app/app/dashboard/profile/AutoCategorizeButton.tsx#L44) 写死 `modelType: "deepseek"` |
| baseUrl | ❌ | 全仓无该配置项 |
| **测试连接 / key 校验** | ❌ | 全仓 grep `testConnection\|validateKey\|测试连接` **零命中**；`src/routes/api/` 只有 match / tag / saves。**key 是否有效只在真正调用时以错误暴露** |
| 保存按钮 | ❌ | 输入即写 store，无保存动作 |

### 2.4 我的简历 [resumes/](src/app/app/dashboard/resumes/)

| 控件 | 文件:行 | 副作用 | 状态 |
|---|---|---|---|
| 导入简历（AnimatedImportButton） | ResumeWorkbench.tsx:241 | 开导入弹窗 | 已接线 |
| 新建简历（顶部 + 空位虚线卡） | ResumeWorkbench.tsx:248 / :270 | 开向导 | 已接线 |
| 卡片预览区 / 编辑 | ResumeCardItem.tsx:94 / :151 | 跳工作台 | 已接线 |
| 复制 | ResumeCardItem.tsx:162 | `duplicateResume` → `addResume` + toast | 已接线（**复制后不跳转**，`resumeId` 未用） |
| 删除 / 确认 / 取消 | ResumeCardItem.tsx:173 / :200 / :195 | `deleteResume` | 已接线 |
| 向导·返回上一步 | CreateResumeWizard.tsx:187 | `goBack`，**不清勾选** | 已接线 |
| 向导·模式卡 ×2（通用 / 岗位专用） | CreateResumeWizard.tsx:242 / :248 | `pickMode` | 已接线 |
| 向导·目标项 / 去新建目标 / 去填数据库 | CreateResumeWizard.tsx:282 / :266 / :224 | `pickTarget` / 跳转 | 已接线 |
| 向导·「开始生成」 | CreateResumeWizard.tsx:330-343 | `onComplete(WizardChoice)`；`checked.size===0` 时禁用 | 已接线 |
| 模板卡 / 就用这个模板 | TemplateGallery.tsx:176 / :262 | `setPreviewTarget` / `onPick(id)`，`picked` 防连点 | 已接线 |
| 板块 Switch | ContentSelection.tsx:98-103 | 改 `disabledSections`；**4 个 `required` 板块恒禁用** | 已接线（设计） |
| 条目 checkbox | ContentSelection.tsx:173-178 | 改 `checked` | 已接线 |
| 勾选 AI 推荐 / 全选 / 清空 | ContentSelection.tsx:111 / :115 / :118 | `checkRecommended` / `selectAll` / `clearAll` | 已接线（前两项仅岗位专用路径渲染） |
| `★` 星标 | ContentSelection.tsx:182-192 | **只读**，仅 `title` 提示「排名信号，非结论」 | 已接线（刻意不可点，设计 D19） |
| JSON 导入 | ImportResumeDialog.tsx:66 | 触发 file input → `addResume` + 跳工作台 | 已接线（**无 schema 校验**，靠 catch 兜底） |
| PDF 导入入口 | — | **不存在**（见 inventory P1：6 个 i18n key 残留） | 死代码 |

### 2.5 投递目标 [targets/](src/app/app/dashboard/targets/)

| 控件 | 文件:行 | 副作用 | 状态 |
|---|---|---|---|
| 新建目标 | TargetsWorkbench.tsx:143 | `setIsCreating(true)` | 已接线 |
| 左侧目标项 | TargetsWorkbench.tsx:161 | `setSelectedId` | 已接线 |
| 公司 / 岗位 / JD 三个输入 | TargetsWorkbench.tsx:320 / :323 / :330 | `setCompany` / `setPosition` / `setJdRaw` | 已接线 |
| 创建 / 保存 | TargetsWorkbench.tsx:350 | `addTarget` / `updateTarget`；三项任一为空时禁用 | 已接线 |
| 取消 | TargetsWorkbench.tsx:355 | 退出新建/编辑态 | 已接线 |
| 删除 | TargetsWorkbench.tsx:362 | `removeTarget` + 清选中 | 已接线（**无二次确认，且连带删掉该岗位的 matchAnalysis**） |
| 智能分析 / 重新分析 | TargetsWorkbench.tsx:212-224 | `handleAnalyze(false)` → `analyzeMatch`，走缓存 | 已接线（无 key 或运行中时禁用） |
| 忽略缓存重跑 | TargetsWorkbench.tsx:228-231 | `handleAnalyze(true)` → `force: true` | 已接线 |
| JD 质量三警告 | TargetsWorkbench.tsx:308-311 | **纯字符串匹配，不调模型** | 已接线 |

三个子组件的分工：`TargetsWorkbench`（骨架 + CRUD + 编排）→ `FitLevelPanel`（岗位级结论，**零交互**，刻意不给分数环）→ `RequirementList`（逐条依据，唯一交互是「原文」折叠）。

### 2.6 求职档案 [profile/](src/app/app/dashboard/profile/)

| 控件 | 文件:行 | 副作用 | 状态 |
|---|---|---|---|
| 左侧 8 个板块导航 | ProfileWorkbench.tsx:80 | `setActiveSection` | 已接线 |
| `Placeholder` 兜底分支 | ProfileWorkbench.tsx:53 | 8 个板块 id **全部被覆盖** → 不可达 | **死代码** |
| 自动归类 | AutoCategorizeButton.tsx:74 | `analyzeTags` → `applyCategories`；未配 key 则跳 AI 页 | 已接线 |
| 导入 / 存档 / 直接替换 | ImportProfileDialog.tsx:74 / :101 / :110 | `replaceProfile` | 已接线（「直接替换」为 destructive） |
| 导出 | ExportProfileButton.tsx:34 | `buildProfileArchive` + 下载 | 已接线（**只导档案，不含简历与目标**） |
| 保存（SaveBar） | SaveBar.tsx:72 | `touchProfile()` 触发 persist 重写 + toast | 已接线（**非必需**，数据本就实时落盘） |
| 姓名/邮箱/电话/生日/地区/照片 | BasicPanel.tsx:49 / :54 / :60 / :163 | `updateBasic` | 已接线（照片强制 3:4 裁剪，存 IndexedDB） |
| 8 个自定义字段 Switch + 值 | BasicPanel.tsx:74 / :82 | `updateCustomField`；字段关掉时输入禁用 | 已接线 |
| 条目拖拽排序 / 展开 / 显隐 / 删除 / 添加 | EntityList.tsx:51 / :73 / :102 / :115 / :132 | `reorderEntities` / `updateEntity` / `removeEntity` / `addEntity` | 已接线（**删除无二次确认**） |
| 条目字段编辑 | EntityEditor.tsx:93 / :82 / :87 / :104 | `updateEntity`，字段集按 `sectionId` 分派 | 已接线 |
| 三组 TagsInput（类别/技能/量化成果） | EntityEditor.tsx:120 / :131 / :140 | `updateEntity` | 已接线 |
| TagsInput 回车/逗号/失焦/Backspace | TagsInput.tsx:32-41 / :72 / :38-40 | 增删标签 | 已接线 |
| 技能组拖拽 / 名称 / 内容 / 删除 / 新增 | SkillGroupPanel.tsx:72 / :84 / :90 / :98 / :127 | `updateSkillGroup` / `removeSkillGroup` / `addSkillGroup` | 已接线（**删除无二次确认**；证书奖项与语言能力两行为固定行，不可拖不可删） |
| 自我评价富文本 | SelfEvaluationPanel.tsx:15 | `setSelfEvaluationContent` | 已接线 |

### 2.7 设置 [settings/](src/app/app/dashboard/settings/)

[page.tsx](src/app/app/dashboard/settings/page.tsx) 只有 31 行，渲染 `BackupPanel`；原「同步目录」卡片已退役（:4-10 注释留痕，代码已删净）。

| 控件 | 文件:行 | 副作用 | 状态 |
|---|---|---|---|
| 导出全库备份 | BackupPanel.tsx:150 | `buildBackup` → `downloadBlob` → 写 `meta.lastBackupAt` | 已接线 |
| 导入备份 | BackupPanel.tsx:154 | 触发 file input | 已接线 |
| 合并导入 | BackupPanel.tsx:219 | `replaceProfile` + `replaceResumes` + `replaceTargets`（按 id 合并） | 已接线 |
| 覆盖导入 | BackupPanel.tsx:222 | 整体替换三个集合，**不可撤销** | 已接线（destructive） |
| 取消 | BackupPanel.tsx:216 | `setPending(null)` | 已接线 |

### 2.8 模板页 [templates/page.tsx](src/app/app/dashboard/templates/page.tsx)

| 控件 | 行 | 副作用 | 状态 |
|---|---|---|---|
| 8 个预设色圆点 | :282 | `setSelectedColor` + **清掉自动轮播** | 已接线 |
| 颜色自动轮播（3s） | :215-228 | `setInterval` 循环切色，卸载时清理 | 已接线 |
| 卡片预览区 / 预览按钮 | :127 / :174 | `setPreviewTemplate` | 已接线 |
| 使用此模板（卡片脚 / 弹窗） | :191 / :381 | `createResume` + 写排版参数 → 跳工作台 | 已接线（**不走向导、不选内容**，产出示例数据空白简历） |

---


## 复核记录

子代理报告未经核实的断言不采信。以下为**抽样复核**结果：

| 断言 | 复核命令 | 结果 |
|---|---|---|
| `PreviewPanel` 6 个 props 未被使用 | 逐名 `grep -n` 全部出现行 | ✅ 成立 —— 每个 prop 只出现在**声明行 + 解构行**，函数体内零使用。（注：整体 `grep -c` 会得到 8，因为把声明与解构也算了进去，不能只看计数） |
| `startRef` / `previewRef` 从不被读 | `grep -rn "startRef\|previewRef" src` | ✅ 成立 —— 只有定义与 `ref=` 赋值，无 `.current` 读取 |
| `lineHeightOptions` 重复定义 | `grep -n lineHeightOptions` | ✅ 成立 —— :33 模块级、:120 组件内 |
| `LAYOUT_CONFIG` 只有 `.DEFAULT` 被用 | `grep -n LAYOUT_CONFIG` | ✅ 成立 —— 仅 :172 |
| `DragHandle` 的 `show` 从不传 | `sed -n '34,40p'` + `grep -n "<DragHandle"` | ✅ 成立 —— 两处调用均无参数 |
| `client.tsx` 子菜单不可达 | `grep -n "items:"` | ✅ 成立 —— `sidebarItems` 无 `items` 字段，:157-172 永不渲染 |
| `client.tsx` 空分支 | `sed -n '84,88p'` | ✅ 成立 —— `if (item.items) { }` 分支体为空 |
| `setCollapsible` 从未调用 | `grep -c setCollapsible` | ✅ 成立 —— 计数为 **1**，即声明处本身 |
| `Loader2` / `TriangleAlert` 未使用 | `grep -n` | ✅ 成立 —— 各只出现在 import 行 |
| `Step` 联合类型的 `"fit"` | `grep -n '"fit"'` | ✅ 成立 —— 只出现在类型定义行；源码注释 :156 自认已移除 |
| `ProfileWorkbench` Placeholder 不可达 | 比对各分支 | ✅ 成立 —— `SECTION_DEFS` 8 个 id 被 :45-51 全覆盖 |
| PDF 导入 6 个 i18n key 无引用 | 逐 key `grep -rn` | ✅ 成立 —— 6 个全部为 0 |
| `export const runtime` 不一致 | `grep -rn` | ✅ 成立 —— profile/resumes/targets/templates 有，**settings 与 ai 没有** |
