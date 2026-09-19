# 工作笔记

记录**证据与中间结论**，避免后续重查。带 `文件:行` 的都是核过的。

---

## 一、2026-09-19 · 项目独立化（已完成）

### 结论
构建/测试/CI **零引用** upstream 只读副本（`git log --all -- rawproject` 为空，目录从未入版本控制）。所以「独立」要处理的不是工程依赖，而是引子、身份、失修。

### 关键事实
- 上游 = Magic Resume v2.0.8；**源码包内无 `.git`**，`package.json` 无 `repository`/`author` → 删除后不存在任何 commit SHA，`v2.0.8` 是全部可追溯信息
- 根 `LICENSE` 与上游逐字节相同（Apache 2.0 + 商业限制条款），**必须保留**
- 逐文件比对（SHA-256）：共有 187 = 逐字节相同 **128** + 被改 **59**；本项目新增 114；上游有而未采用 113
- Apache 2.0 §4(b) 要求对改过的上游文件显著声明，而 `src/` 里**没有任何 Copyright 声明** → 删除前必须比对，否则永久失去基线

### 两个埋着的坑（实测确认后才落方案）
1. **`head()` 在浏览器里也会求值**（客户端导航时）。运行时读 `process.env` 会抛 ReferenceError —— 构建过、dev SSR 过，只在 `/` → `/zh` 跳转时炸。改用构建期 `define` 注入。
2. **`public/` 静态文件会把路由完全遮住**：`server.mjs:163` 先查静态文件、`:190` 才交给路由；Cloudflare `[assets]` 同优先级。所以 robots/sitemap 改服务端路由时，`public/` 下同名文件必须删。

### 产物
- `NOTICE` + `docs/upstream-derivation.md`（逐文件清单）
- `src/config/site.ts` —— canonical/og/hreflang/robots/sitemap 的单一来源；未配 `SITE_URL` 时不输出任何绝对 URL
- `src/routes/robots[.]txt.ts` / `sitemap[.]xml.ts`（`[.]` 转义，实测路由为 `/robots.txt`）
- 主题 storage key `magic-resume-theme` → `joblume-theme`；**e2e 补了 dark class 断言**（原先 key 写错也照样全绿，那条检查是空转）

### 上游 `CHANGELOG.md` 保底副本
`/tmp/jl-audit/upstream-CHANGELOG.md`（23KB，仓库里没有第二份）。`/tmp` 会被清，需要就早点取走。

---

## 二、文档失修的三层（已修，供参考）

1. **AI 契约整代换了**：`docs/03 §3`、`docs/05 §1`、`docs/06`、`docs/02` 的 D13/D20/D22 都在描述 v1–v3 的「模型判定推荐/不推荐 + 逐字举证」。实际 **v4 起改为「模型只排序、划线交给代码」**（`validateMatchResult.ts:432` 由名次推导 `level`）。权威版本史在 `buildMatchPrompt.ts` 顶部。
2. **Provider 说 4 家实际 1 家**；路由表把已删的 `/api/polish`、`/api/grammar` 列为「✅ 复用」，又漏了实际存在的 `/api/tag`。
3. **源码注释同样在说谎**：`types/profile.ts`、`TagsInput.tsx`、`lib/profile/categories.ts`、`store/useCareerProfileStore.ts` 仍在解释已删的「同类衰减」。

### 一条纪律（重要）
**不要批量「修正」文档里指向已删除文件的路径。** `docs/03:795` 原文是「**被删除的文件**：skillDictionary.ts、synonyms.ts…」—— 它在**记录删除决策**。批量改会销毁「为什么砍掉某个设计」这个项目最有价值的记录。只动「关于当前状态说假话」的地方。

---

## 三、评测体系现状（A 线起点）

| 问题 | 位置 | 具体 |
|---|---|---|
| 口径 bug，已自认且已写出正确做法 | `docs/07:190` | 覆盖虚报率按案例平均，**没标注的案例计 0 分 = 白拿满分**，指标被稀释。正确做法是在「有标注的案例」上取平均。本轮被显式推迟，理由是「改口径的动机来自看数据之后 —— 那样的改动不可信」 |
| 标注太薄 | `docs/07:187` | 全数据集 **15 条**「档案无支撑」标注、4 条「虚报覆盖」标注。**一条就能让某案例比率动 25 个百分点以上** |
| 缺失项召回是下界 | `docs/07:184` | 三条已知边界（同义关系、2 字主题词、模型给出另一个正确但不同的缺口）在标注集 `known` 列里、**不计分**。104 对里 11 对属于这几类 |
| 口径在 v5 变过 | `docs/08:12` | 职责类要求不再参与缺失判定、模型区分 weak 与 missing → **与旧版不可直接比较** |
| 阈值附近是掷硬币 | `docs/08:14` | 同一份代码连跑两次，「理想集合重合度」实测 **69.3% / 72.1%**，阈值 70% |

### 2026-09-19 实测：各指标的真实分母

逐案例量过（不是估算）：

| 指标 | 分母 | 结论 |
|---|---|---|
| 覆盖虚报率 | **3/8** | 原本 5 个案例注入假满分 0 → 已修 |
| 关键经历召回 | **7/8** | `jun-02` 无 must-have 标注 → 已修（docs/07 没记这条） |
| 缺失项召回 | 8/8 | 无稀释 |
| 要求项召回 | 8/8（每案例 10–15 条） | 无稀释 |
| 理想集合重合度 | 恒非空 | 无 |
| NDCG / 斯皮尔曼 | n≥2 | 无 |

**2026-09-19 修复后，`docs/08` 的旧数字需要用新口径重跑才有意义。**
尤其是「覆盖虚报率 0.0% ✅」与「关键经历召回 89.6% ❌」—— 两者都含假满分。

### 12 项指标实测（`docs/08`，**旧口径**）
要求项召回 97.9%✅ · **缺失项召回 20.8%❌**(≥80%) · 覆盖虚报率 0.0%✅ · 理由幻觉率 0.8%✅ · NDCG@5 88.0%✅ · 斯皮尔曼 76.0%✅ · top-5 命中率 74.2%✅ · **关键经历召回 89.6%❌**(≥100%) · 理想集合重合度 72.1%✅ · 选择质量 92.4%✅

---

## 四、PDF 文字层缺陷（B2）

**实测**：一份简历 **160 个汉字里 18 个（11.3%）** 落在 U+2E80–U+2FDF。例：`页→⻚`、`立→⽴`、`大→⼤`、`工→⼯`。

- 根因：Chromium 生成 ToUnicode CMap 时，对「汉字与康熙部首共用同一字形」的字符挑了部首码位
- **与字体无关**：项目自带字体与系统 PingFang SC 各一行，两种都复现
- **NFKC 能还原大多数**，唯独 `⻚`（U+2EDA）**无兼容分解**，还原不了
- 两条现有路径：`src/utils/print.ts`（浏览器打印，有文字层但 11% 错）vs `src/utils/export.ts`（jspdf canvas，无文字层）
- **过度承诺**：导出弹窗写「文字可选中、可被 ATS 解析」（`docs/04:407`）
- 可能的第三条路：用已有的 `jspdf` 自绘文字层，自带 ToUnicode，绕开 Chromium CMap

---

## 五、其它已知边界

- **覆盖判定缺口**（`docs/07:132`）：校验只查经历存不存在，**不查它与这条要求有没有关系**。「精通 Rust 由一段纯前端经历支撑」能通过全部校验。已用一条测试钉住
- **`suggestedFocus` 死字段**：`validateMatchResult.ts:392` 写入，**界面从不读**（同类于 D26 删掉的 `skillTags`/`qualityScore`）
- **eslint 完全不可用**：`.eslintrc.json` 只有 `{"extends": "next/core-web-vitals"}`，该预设已卸载；`package.json` **没有 lint script**
- **字体体积**：`public/fonts` 149MB → `dist/client/fonts` 155MB，每次构建全量复制。`font.css` 有 10 条 `@font-face`，目录里 12 个文件 —— `NotoSansSC.ttf`(13MB) 与 `Source_Han_Serif_SC_Light_Light.otf`(24MB) **无人引用**

---

## 六、可复用的验证命令

```bash
npx tsc --noEmit                 # 类型
npx vitest run                   # 298 单测
npx vite build                   # 构建
npm run start                    # 生产服务器（server.mjs，静态→路由的优先级只在它上面才成立）
npm run e2e:core                 # 需先起服务端；22 项，含 PDF 文字层与主题 token
```

**注意**：`e2e:core` 连的是 `E2E_BASE ?? http://localhost:3000`，且需要 playwright chromium（`npm run install:playwright`）。**要验静态文件与路由的优先级，必须用 `pnpm start` 而不是 `pnpm dev`** —— dev 不走 `server.mjs`。
