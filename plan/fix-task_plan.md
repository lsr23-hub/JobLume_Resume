# Task Plan: 分批修复与删除

## 工作方式（用户给定）
每次只处理**一类问题**。改完 → 跑检测 → 报告「我的验收结果」+「你的验收流程」。

## 批次队列（按 health-report 的处理顺序）

| 批 | 内容 | 风险 | 状态 |
|---|---|---|---|
| **1** | **P0 i18n 缺 key（实测 4 处，非 5 处）** | 低 | **✅ 已完成** |
| 2 | P0 安全：GitHub token 随导出外泄 | 低 | **✅ 已完成** |
| 3 | P1 死代码删除（3 个孤儿文件 + 32 项） | 低 | **✅ 已完成** |
| 4 | ~~P0 安全：富文本 XSS 净化~~ → **改为移除 `@heroui/react`**（用户选 A） | 低 | **✅ 已完成** |
| 5 | P1 数据正确性 4 条 | 中 | 待办 |
| 6 | P2 依赖与结构 | 高 | 待办 |

## 每批的固定流程
1. **改前**：确认工作树干净、记录基线（测试数、构建状态）
2. **改**：只动这一类
3. **检测**：`vitest run` + `tsc` + `vite build` + audit 脚本重跑
4. **报告**：我的验收结果 + 你可执行的验收流程

## 约束
- 每批结束必须是**绿的**（见项目 memory：跨文件重构拆成「纯逻辑先行、再接线」两步）
- 不碰 `saves/`（真实用户数据）
- 一次一批，等用户确认再下一批

## 批次 1 记录（已完成）

**改动**：只动 `src/i18n/locales/{zh,en}.json`，共 4 处 × 2 文件。

| # | 问题 | 修法 |
|---|---|---|
| 1 | `"category.placeholder"` 这个 JSON 键**字面含点号**，而取值按 `.` 拆路径 → 永远取不到 | 改名为代码请求的 `categoryPlaceholder` |
| 2 | `profile.empty` 缺 → 空列表显示原始 key | 新增（zh/en） |
| 3 | `profile.languageLabel` 缺 → **语言能力整行从生成的简历里消失**（materialize 的 `&& languageLabel` 为假） | 新增，与既有 `certificatesLabel` 同形 |
| 4 | `dashboard.resumes.importDialog.description` 缺 → 弹窗副标题显示原始 key | 新增（zh/en） |

**更正**：原判「5 处」含一条误报 —— 我说 `workbench.layout` 整个命名空间不存在，
实际路径是 `workbench.sidePanel.layout`，它一直存在。已修正 health-report。

**检测结果（全部通过）**

| 检测 | 改前 | 改后 |
|---|---|---|
| i18n 真实缺失 key | 4 | **0** |
| 单元测试 | 432 passed | **432 passed** |
| `tsc --noEmit` | 0 错 | **0 错** |
| `vite build` | 通过 | **通过** |
| e2e acceptance | 12/12 | **12/12** |
| 新增界面断言 `pnpm audit:i18n-ui` | — | **14/14**（连跑 2 次稳定）|

**反向验证（证明测试不是空转）**：临时删掉 `profile.languageLabel` 重启服务重跑，
脚本报错并打印出 `languageLabel：英语 CET-6` —— 确认能抓到真实缺陷。

**过程中我自己踩的两个坑（已修）**
1. 恢复 `profile.languageLabel` 时误把它写进了 `profile.skills` 之外的位置，
   差点删掉 `profile.skills.languageLabel`（`SkillGroupPanel` 用的那个）。
   已恢复，并补了 ②' 四条断言专门钉住这两个同名不同位的键。
2. `② 类别 placeholder` 用固定 `waitForTimeout` 导致闪断，断言写成 `count()>0` 时
   闪断被伪装成真实失败。改成显式 `waitFor({state:"visible"})`。

## 批次 2 记录（已完成）

**改动**：5 个源文件 + 1 个测试文件。

| 文件 | 改动 |
|---|---|
| `src/lib/backup.ts` | 新增 `stripResumeCredentials`（纯函数）；`buildBackup` 里对简历应用 |
| `src/utils/export.ts` | `exportResumeAsJson` 序列化前摘凭据 |
| `src/components/shared/PdfExport.tsx` | 导出弹窗加一条「不含凭据」说明 |
| `src/i18n/locales/{zh,en}.json` | 新增 `pdfExport.modal.credentialNotice` |
| `src/lib/backup.test.ts` | +6 条测试 |

**为什么备份也要摘**：全库备份的 `resumes` 数组里带同一个 token，
而备份文件同样会躺在下载目录、云盘、同步文件夹里明文存放。原先只盯着
「简历 JSON 导出」会漏掉这一条。

**为什么存档镜像不摘**：`saves/` 是应用自己的运行数据，摘了贡献日历当场失效。
专门写了一条防回归测试钉住这点（走 `diffSnapshot`，断言 token 仍在）。

**检测结果**

| 检测 | 改前 | 改后 |
|---|---|---|
| 单元测试 | 432 | **438**（+6） |
| `tsc --noEmit` | 0 错 | **0 错** |
| `vite build` | 通过 | **通过** |
| `pnpm e2e:acceptance` | 12/12 | **12/12** |
| `pnpm e2e:saves` | 10/10 | **10/10** |
| `pnpm audit:i18n-ui` | 14 条 | **26 条全绿**（新增 12 条落盘断言）|

**反向验证（两条路径分别验证）**
- 还原 `export.ts`（不摘）→ 断言报错并打印出 `ghp_MUST_NOT_LEAK_1234567890`
- 还原 `backup.ts`（不摘）→ **只有备份那条断言**报错，导出那条仍绿

两次都证明测试抓的是各自那条路径，不是碰巧。

**过程中的坑**：`tsc` 抓到我测试里 `as never` 导致 `.basic` 不可访问 —— 单测能过但类型不过。
改用 `as unknown as ResumeData`。这条正是 `plan/notes.md` 记的「批量替换与单测的盲区」。

## 批次 3 记录（已完成）—— 量化

### 源文件

| 指标 | 改前 | 改后 | 变化 |
|---|---|---|---|
| src 文件数 | 302 | **299** | **−3** |
| src 行数 | 38,174 | **37,788** | **−386 (−1.0%)** |
| src 字节 | 1,427,607 | **1,416,092** | **−11,515 (−11 KB)** |
| `git diff --shortstat` | — | — | **−433 / +154 = 净 −279 行**（28 个文件）|

### 构建产物（用 `git stash` 取干净 HEAD 重建对比，不是估的）

| 指标 | 干净基线 | 现在 | 变化 |
|---|---|---|---|
| client JS | 3,158,113 | **3,155,382** | **−2,731 (−0.09%)** |
| client 总计 | 20,390,295 | **20,386,784** | **−3,511 (−0.02%)** |

### 删了什么（按行数）

| 删减 | 对象 |
|---|---|
| −133 | `workbench/[id]/page.tsx` 的 `LayoutControls`（99 行、从未渲染）+ `LAYOUT_CONFIG` 三个未用键 + `DragHandle.show` 死参数 |
| −59 / −35 / −27 | 三个孤儿文件 `alert.tsx` / `PdfIcon.tsx` / `resumes/utils.ts` |
| −32 | `client.tsx` 的侧边栏子菜单整块 + `collapsible` 死状态 + 两个 `items` 分支 |
| −20 | `preview/index.tsx` 的 6 个死 props + 2 个死 ref |
| −17 | `PreviewDock.tsx` 未使用 import |
| −8 ×3 | `Field.tsx` 8 个未用 import；`ProfileWorkbench` 不可达分支 + `Placeholder` |
| −7 ×3 | 三个 Item 组件的 `onDelete` / `onCancel` 死 props |
| −9 ×2 | 两个 locale 的 6 个 PDF 导入残留 key |

### 为什么产物只降 2.7 KB（诚实说明）

被删的绝大多数是**死代码，已被 tree-shaking 提前消掉**，所以源码少 386 行而产物几乎不变。
真正进包的是 `registry` chunk（686 KB，4 套模板）与 `_id` 编辑器 chunk（193 KB），两者本次未动。
**结论：这批的价值在可维护性，不在体积。** 要真正瘦产物得动别的（见下）。

### 检测结果（全部通过）

| 检测 | 结果 |
|---|---|
| 单元测试 | **438 passed** |
| `tsc --noEmit` | **0 错** |
| `vite build` | 通过 |
| e2e acceptance / saves / core / users / targeted | **12 / 10 / 22 / 64 / 15** 全绿 |
| `pnpm audit:i18n-ui` | **26/26** |
| i18n 真实缺失 key | **0** |

### 顺带发现

项目 **eslint 是坏的** —— `.eslintrc.json` 还在 `extends "next/core-web-vitals"`，
但包已卸载（迁移出 Next 时没清理）。`npx eslint` 直接报 `couldn't find the config`。
所以「未使用的 import」这块**目前无人守**，tsc 也不报（没开 `noUnusedLocals`）。
本次为此写了 `scripts/audit/unused-imports.mjs` + `scripts/audit/prune-imports.mjs`。

### 工具开销（要记在账上）

`scripts/` 从 3,404 → 3,555 行（+151），是我新增的 4 个 audit 脚本。
这是**开发期工装**，不进产物，但确实是净增。

## 批次 4 记录（已完成）—— 移除 `@heroui/react`

用户选「A：删 `@heroui/react`」而非原队列的 XSS 修复（那批是加代码，与瘦身目标相反）。

### 动机

这个依赖的**全部用途**就是 `providers.tsx` 里一个 `<HeroUIProvider locale={locale}>` 包裹 ——
而全项目没有任何 HeroUI 组件消费这个 locale。实测：83 个包只为传一个没人用的 prop。

### 改动（4 处）

| 文件 | 改动 |
|---|---|
| `src/app/providers.tsx` | 去掉 `HeroUIProvider` 包裹与 import（61 → 56 行）|
| `tailwind.config.ts` | 去掉 `heroui()` 插件 + 它的 content 源（186 → 182 行）|
| `package.json` | 删除 `@heroui/react`、`@heroui/theme` |
| `pnpm-lock.yaml` | 重装后自动更新（heroui 出现次数 → **0**）|

### 量化结果

| 指标 | 改前 | 改后 | 变化 |
|---|---|---|---|
| **client CSS** | 316,508 | **110,955** | **−205,553（−64.9%）** |
| client JS | 3,155,382 | 3,147,875 | −7,507（−0.2%）|
| **client 总下载** | 20,386,784 | **20,173,724** | **−213,060（−1.0%）** |
| 顶层 dependencies | 49 | **47** | −2 |
| node_modules 包目录 | — | — | **−79 个 heroui 目录（−15 MB）**|

**CSS 是主战场**：`heroui()` 插件往产物里注入了 148 个设计 token 类
（`bg-content1` / `bg-danger-100` / `bg-default-500` …），
而源码里**一个都没用过**（逐类名 grep 核实）。这 205 KB 是纯死样式。

### 安全前置核查（删之前做的）

1. 逐类名 grep 148 个 heroui 类，源码中出现过的只有 `border-primary` / `rounded-` /
   `focus-visible` 等通用词 —— 经核实 `border-primary` 来自**我们自己的** tailwind 配置
   （shadcn 语义色），不是 heroui 提供的
2. 改后复查产物里关键 token 全部还在：`--primary` / `--muted` / `--card` / `dark:` /
   `animate-in` / `rounded-xl` / `text-muted-foreground` / `bg-card` / `border-border`
3. 产物里 heroui 痕迹 → **0**

### 检测结果（全部通过）

| 检测 | 结果 |
|---|---|
| 单元测试 | **438 passed** |
| `tsc --noEmit` | **0 错** |
| `vite build` | 通过 |
| e2e acceptance / saves / core / users | **12 / 10 / 22 / 64** 全绿 |
| `pnpm audit:i18n-ui` | **26/26** |
| **视觉回归（截图）** | 落地页 / 简历列表 / 职业数据库 / 设置页 / **暗色设置页** —— 5 张全部正常，0 页面错误 |

### 副产物：发现 pnpm 不清理孤儿包

`pnpm install` 与 `pnpm install --force` 都没有删掉 `.pnpm` 下 79 个 heroui 目录
（锁文件已清零，磁盘还留着 15 MB）。手工 `rm -rf node_modules/.pnpm/*heroui*` 后
**重新构建 + 全量测试仍全绿**，证明删的确实是孤儿。
下次遇到「依赖删了但磁盘没瘦」可照此处理。

## Status
**批次 4 完成**，等用户验收后再定下一批。
