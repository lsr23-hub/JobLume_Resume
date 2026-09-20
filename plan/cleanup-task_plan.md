# Task Plan: 代码清理（Code Cleanup）

## Goal
对 JobLume_Resume 做一次系统性代码清理：先建立**完整功能清单**（页面 / 交互 / API 输入输出），
据此判定死代码与冗余依赖，再分批删除。清单本身是可复用的验收基线。

## 用户给定的步骤（严格按序执行）
1. **[进行中] 列清单** —— 列出全部现有功能：页面、按钮交互、API 接口输入与输出
2. 待用户给出后续步骤

## Phases
- [x] Phase 1: 列清单 —— 路由 / 页面（21 条路由，3 类）
- [x] Phase 1: 列清单 —— API 接口（3 内部 + 2 外部，含输入/输出/错误码）
- [x] Phase 1: 列清单 —— Store 与持久化（4 store + 镜像 + IndexedDB）
- [x] Phase 1: 列清单 —— 产物交付（6 种导出）
- [x] Phase 1: 列清单 —— 编辑器交互面（子代理盘点 + 抽样复核）
- [x] Phase 1: 列清单 —— 可清理项（P0 缺陷 5 / P1 死代码 24 / P2 待判 30）
- [x] Phase 1: 汇总成 deliverable + 交叉核对
- [x] Phase 1: 仪表盘板块交互明细 → 已并入 feature-interactions.md §二

## Ground Rules（约束）
- **只读盘点，不改任何源码**。本阶段不删除、不重构。
- `saves/` 是真实用户数据，任何后续清理都不得 glob 删除（见项目 memory）
- 清单必须**可核对**：每条写 `文件:行`，不用「大概」「可能」
- 区分「已实现且接线」「已实现但无人调用」「根本没有」三种状态

## Deliverable
- `plan/feature-inventory.md` —— 功能清单总表（页面 / API / 数据 / 模板 / 导出 / AI + 可清理项判定）
- `plan/feature-interactions.md` —— 逐控件交互矩阵（编辑器 + 仪表盘，均已完成）
- `scripts/audit/orphan-scan.mjs` —— 孤儿文件扫描（可重跑）
- `scripts/audit/i18n-scan.mjs` —— i18n key 对齐扫描（可重跑）

## 已发现（摘要，详见 inventory 文末）

| 级别 | 条数 | 内容 |
|---|---|---|
| **P0 用户可见缺陷** | 5 | i18n key 缺失 → 界面**静默显示原始 key**（不报错）。最重的一条：`workbench.layout` **整个命名空间不存在**，「添加板块」弹出层里 5 个非必填板块的标题全坏 |
| **P1 确定死代码** | 32 | 3 个孤儿文件；`PreviewPanel` 6 个 props + 2 个 ref 全死；3 组未使用的 `onDelete`/`onCancel`；侧边栏子菜单整块不可达；`setCollapsible` 从未调用；PDF 导入功能已删但 6 个 i18n key 留下；i18n 死 key 上界 191/715 |
| **P2 待人工判断** | 26 | `@heroui/react` 整个依赖只为 1 个 `locale` prop；antd + HeroUI **两套 UI 框架并存**；lodash 只用了 2 个函数；三处删除**无二次确认**（删岗位还连带删掉 matchAnalysis）；移动端抽屉方向首帧错误 |

**反向证据（干净的）**：`src/lib/**`、`src/config/**`、`src/hooks/**` 的全部 export 都有跨文件使用者；全项目**零** TODO/FIXME 注释、**零**空 `onClick` 桩。

## Status
**Phase 1 完成。** 交付 4 份产物（见上）。**未改动任何源码** —— `git status` 只有 `plan/` 与 `scripts/audit/` 下的新增文件。

**等待用户给第二步。** 本阶段刻意不做的事：不动任何 `src/` 文件、不删依赖、不碰 `saves/`（那是真实用户数据）。
