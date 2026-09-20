# 存档系统整体方案

> 状态：设计稿，待实施。执行清单见 `plan/saves-task_plan.md`。
> 取代 `docs/02-data-model.md` 的 D35（单向镜像）。实施完成后按仓库惯例**追加 D36**，不改写 D35。

## 0. 一句话

**手动保存为主 + 五个明确写盘时机 + 启动哈希对账。** 磁盘是权威副本，浏览器是工作副本；
两边靠「每条记录的内容哈希 + 磁盘上的基线文件」对账，只有两边都改过才叫冲突，才打扰用户。

## 1. 用户看到的行为

| 时刻 | 系统行为 | 用户看到 |
|---|---|---|
| 打开应用 | 读当前用户在磁盘上的数据 + 基线，逐条对账 | 短暂 loading；对账有冲突才弹框 |
| 编辑 | 只写浏览器（localStorage / IndexedDB），**不写盘** | 状态条显示「未保存 N 处 · 立即保存」 |
| 点「立即保存」 | 只提交变化的那几条 | 「已保存 HH:MM」，状态条归零 |
| 切用户 | 静默保存当前用户后切换 | 无感（失败才提示） |
| 关简历编辑器 | 静默保存后返回 | 无感 |
| 页面隐藏 / 关闭 | 尽力提交一次（`sendBeacon`） | 若有未保存，弹浏览器原生确认框 |
| 应用内离开（切板块）且有未保存 | 三按钮对话框：保存 / 不保存 / 取消 | 我们自己的 UI，可完全自定义 |
| 磁盘不可达（静态部署等） | 降级为纯浏览器模式 | 常驻提示「本次部署没有磁盘存档，数据只在这个浏览器里」，**不显示未保存** |

## 2. 数据布局

### 磁盘（权威副本，`SAVES_ROOT` 下）

```
saves/<userId>/
├── .baseline.json          # 新增：同步基线，每条记录的内容哈希 + schemaVersion
├── profile.json            # 一个用户一份
├── resumes/<resumeId>.json
├── jds/<targetId>.json
├── images/<imageId>.<ext>  # 新增：图片原始字节
└── <name>.json.bak         # 覆盖前留一代（已有，保留）
```

`.baseline.json` 以点开头，被 `SAFE_SEGMENT`（不允许前导点）天然排除在 `listSaveIds` 之外，
不会被当成一份存档 —— 这一点要有测试钉住。

```json
{
  "schemaVersion": 2,
  "records": {
    "profile": "a1b2c3…",
    "resume:5f116d4b-…": "d4e5f6…",
    "jd:7a8b9c0d-…": "112233…"
  }
}
```

### 浏览器（工作副本）

| 位置 | 内容 | 说明 |
|---|---|---|
| `localStorage` | 三个 store 的持久化切片（沿用现有 key 与 `userScope.ts` 的迁移/归一化） | 工作副本，刷不丢 |
| `localStorage` | `joblume-prefs`：`currentUserId` / `activeByUser` | UI 状态，不是数据 |
| `localStorage` | `ai-config-storage`：API Key | **永不落盘** |
| `IndexedDB` | 图片字节 | 从「存储」**降级为「缓存」**，丢了能从磁盘重建 |

## 3. 核心机制：基线即脏标记

### 为什么不用布尔 dirty 标记

刷新页面后标记丢了（数据还在），提醒失效、且用户以为存过了。**基线天然免疫这个问题**：

```
dirty(记录 r)  ⟺  contentHash(本地 r) ≠ baseline[r]
```

基线存在**磁盘**上，刷新后重新读到 → 未保存的改动仍然 ≠ 基线 → 脏状态依然正确。
不需要任何额外的「脏集合」持久化。

### 内容哈希

`src/lib/saves/hash.ts`，**前后端共用同一份代码**：

- `stableStringify(value)` —— 递归按键排序后序列化。**必须有**，否则用户手改文件时
  格式化、键重排会产生假冲突 —— 而「手改文件生效」正是本方案的核心场景之一。
- `contentHash(value): Promise<string>` —— `crypto.subtle.digest("SHA-256", …)`，取前 16 字节 hex。
  Node 20 与所有现代浏览器都自带 `globalThis.crypto.subtle`，**零新依赖、真哈希、两边算法一致**。

哈希由**服务端在写盘成功后计算并返回**（服务端算的是真正落到磁盘的那份），客户端把它存为基线。
客户端自己只在需要判断「本地是否变了」时算，与基线比。

### 写盘顺序（决定失败时的可恢复性）

```
1. copyFile(目标, 目标.bak)      ← 已有逻辑，保留
2. writeFile(目标, 正文)
3. 全部 op 成功后，一次性写 .baseline.json
```

失败在任意一步 → 基线没更新 → 下次启动仍是脏 → 用户可重试。**基线是唯一的完成标记。**

## 4. 同步协议

### 端点（全部 `POST /api/saves`，`DELETE` 方法退役）

批量 ops 走 POST 而不是 DELETE 方法，有一个具体理由：`sendBeacon` **发不了 DELETE**，
而页面隐藏时的兜底提交只能用 `sendBeacon`。

```
POST /api/saves
{
  "userId": "…",
  "ops": [
    { "op": "write",  "kind": "resume", "id": "…", "data": { … } },
    { "op": "delete", "kind": "jd",     "id": "…" }
  ]
}

→ 200 {
  "ok": true,
  "results": [
    { "key": "resume:…", "ok": true,  "hash": "d4e5f6…" },
    { "key": "jd:…",     "ok": false, "error": "…" }
  ],
  "baseline": { "schemaVersion": 2, "records": { … } }   // 更新后的完整基线
}
```

**逐条独立、整批不原子**：写文件做不到跨文件事务，所以返回每条的结果，客户端只把
成功的移出脏集，失败的留下重试。基线只在有成功写入时才更新。

图片走独立端点（见 §6）。

### 启动对账算法

```
读三份：local（内存/store）、disk（GET 回来的）、baseline（随 disk 一起返回）

对每条记录 r：
  local == baseline 且 disk == baseline   → 不动
  local != baseline 且 disk == baseline   → 推：本地 → 磁盘
  local == baseline 且 disk != baseline   → 拉：磁盘 → 本地      ★手改文件生效
  local 不存在       且 baseline 存在     → 浏览器被清过 → 从盘恢复
  local == disk（都 != baseline）          → 一致但基线过期 → 只更新基线，不传输
  其余（两边都改且互不相等）               → 冲突 → 记入 conflicts[]，两边都不动
```

**不自动处理冲突是刻意的**：这是唯一会丢数据的路径，交给用户看一眼比任何启发式都安全。

### 磁盘用户列表（清缓存后的入口）

清 localStorage 会连 `currentUserId` 一起丢，用户会走到「选择用户」弹窗。此时需要知道
磁盘上都有谁，否则他的数据「在盘上但选不出来」。

```
GET /api/saves?list=1  →  { ok: true, users: [{ id, name }] }   // name 来自各用户的 profile.json
```

## 5. 五个写盘时机

| # | 时机 | 实现 | 失败处理 |
|---|---|---|---|
| 1 | 点「立即保存」 | 直接调用 `save()` | 明确报错 + 保留脏状态，可重试 |
| 2 | 切用户 | 切换前 `await save()` | 提示失败并**中止切换**（否则改动落到新用户名下） |
| 3 | 关简历编辑器 | 离开前 `await save()` | 提示失败，留在原页 |
| 4 | 页面隐藏 / 关闭 | `pagehide` → `sendBeacon` | 无法感知结果；未成功的下次启动仍是脏 |
| 5 | 应用内离开（切板块、返回列表）且有脏 | 三按钮对话框（保存 / 不保存 / 取消） | 「保存」失败则留在原页 |

「不保存」= 丢弃内存改动（重新从 localStorage 装载基线内容），盘上保持旧内容。
**必须能真正丢弃**，否则这个按钮是骗人的。

`beforeunload` 只在有脏时挂监听。它的能力边界见 §10。

## 6. 图片

- 三处形态统一为**引用**：`basic.photo` / 简历照片 / `Certificate.url` 都存 `<imageId>.<ext>`
- 二进制落 `saves/<uid>/images/`，IndexedDB 只作缓存（渲染时解析成 `blob:` URL，与现在一致）
- **选中即上传**，不等手动保存。理由：图片是素材不是文档，没有「草稿」语义；延后上传会造出
  「数据已保存但照片没保存」这种没法向用户解释的中间态
- 渲染侧需要 `imageEpoch` 进三处 effect 的 deps（引用没变但字节到齐了，现在的 deps 感知不到）
- **孤儿 GC**：手动保存成功后，服务端扫描数据里引用的 imageId，删掉未被引用的文件。
  不做定时任务——只在明确的时刻跑，行为可预测

## 7. 备份与导出（分两层）

| 用途 | 格式 | 内容 |
|---|---|---|
| **全库备份**（防丢、换机器） | `.zip` | `manifest.json` + `backup.json`（档案 + 简历 + 岗位）+ `images/` 原始字节 |
| **单份导出**（给人看、进 git、发给招聘方） | `.json` | 单份简历 / 职业数据库；**摘掉 `basic.githubKey`**；图片以引用列出 |
| **派生物** | PDF / PNG / Markdown | 现状不变 |

zip 用 `fflate`（约 8KB、无依赖、作者是 `ponypack` 那位，被广泛使用）客户端生成。
`manifest.json` 让文件**人能看懂**，也是跨版本导入的版本判据。

导入沿用现有语义：**merge**（id 冲突跳过）/ **replace**（整体替换当前用户），
沿用 `mergeById` 与 `normalizeImportedTarget`（两者都已有测试）。

顺带修一个真缺陷：`ImportProfileDialog` 的 `hasContent`（只看 `basic.name` + `entities`）
判定「空库」→ 直接替换、不问、不给存档机会。而库里只有技能分组 / 证书 / 语言 / 自我评价时
它返回 false —— 那恰恰是最难重建的部分。改用 `lib/profile/hasUsableProfile.ts`
（那份判定是完整的）。

## 8. 安全

| 项 | 现状 | 方案 |
|---|---|---|
| 端点默认关 | `SAVES_ENABLED !== "1"` → 404 | 保留。自托管 compose 里显式开 |
| 无鉴权 | `GET /api/saves` 不带参数返回**所有用户**整棵树 | ① `list=1` 只回 id + 姓名，不回内容；② 默认只绑回环 |
| 监听地址 | `HOSTNAME=0.0.0.0` | compose 映射 `127.0.0.1:3000:3000`，默认不对局域网暴露 |
| 对外部署 | README 警告 | README 给 Caddy / nginx basic-auth 配置示例（**不自造鉴权体系**），另设可选 `SAVES_TOKEN` 作便利项 |
| 限流 | `/api/saves` 不限流 | 纳入现有 `rateLimit` |
| 路径安全 | 三层防护（白名单 + `path.relative` + 目录不相交） | **原样保留**，图片路径把「id」与「扩展名」分开校验（`SAFE_SEGMENT` 不含点） |
| 日志 | 不记请求体 | 保留 |

## 9. 开源分发（GitHub）

### 阻塞项（先确认再谈发布）

- **许可证**：`LICENSE` 是「MAGIC RESUME - COMMERCIAL RESTRICTIONS & USER AGREEMENT」，
  Apache 2.0 **附加商业使用限制**。公开分发是否允许、限制条款要不要保留，
  **需要你自己确认（必要时找法律意见）**。这一条不解决，后面都不用做
- **真实姓名**：`plan/task_plan.md:408` 含一个真实姓名（开发期事故记录里的存档目录名）。
  该文件已进 git，公开前必须清理

### 分发能力

| 项 | 方案 |
|---|---|
| 安装方式 | `docker compose up -d` 开箱可用；`node server.mjs` 备选；本地 dev 保留 |
| 数据位置 | compose 改成 **bind mount** `./saves:/data/saves` —— 用户在宿主机直接看到、能拷、能进自己的备份。现在的 named volume 与「文件夹就是我的数据」相冲突 |
| 首次运行 | 无 `saves/` 目录时自动创建，不报错（`mkdir recursive` 已有） |
| 升级路径 | `schemaVersion` 写进 `.baseline.json` 与备份 `manifest.json`；未知版本**拒绝启动写盘并提示**，不静默迁移 |
| CI | 新增 `ci.yml`：`tsc --noEmit` + `vitest run` + `vite build`（PR 门禁）。现有 `deploy.yml`（Workers，手动触发）可删或标注为不支持 |
| 环境变量 | 新增 `.env.example` |
| README | 重写部署段：三种方式 + 数据在哪 + 怎么备份（拷 `saves/`）+ 怎么升级 + 对外部署的安全要求 |

## 10. 已知边界（诚实记录，写进文档）

1. **`beforeunload` 不能自定义**：文案与按钮由浏览器固定，规范禁止改。所以**做不出「保存并离开」**这个按钮，
   移动端（iOS Safari）基本不触发，崩溃 / 掉电 / 进程被杀不触发。所以它是体验优化，不是数据保障 ——
   真正的保障是「未保存的内容本身就在 localStorage 里，下次打开还在」。
2. **纯手动模型下「忘了点保存 + 清浏览器缓存」仍会丢**。三个上下文切换点把概率压到很低，但压不到零。
3. **多标签页**：两个标签各自保存 → 后写的静默覆盖先写的。可检测（`storage` 事件），本方案暂不处理，
   留作后续（成本低）。
4. **磁盘是权威副本**：`saves/` 被删且浏览器也被清 = 全丢。`.bak` 只保护「写坏」，不保护「反悔」。
5. **`saves/` 不进 git**（含姓名、联系方式、经历）。所以「拷仓库换机器」实际要单独拷 `saves/`。
6. **图片 GC 只在保存后跑**：长期不保存的用户，盘上会攒孤儿图片。可接受（体积小、无功能影响）。

## 11. 由本方案带来的删除

| 文件 | 处置 | 理由 |
|---|---|---|
| `src/lib/saves/journal.ts` + 测试 | **删除** | 它解决的是「防抖窗口内关标签页会丢」。手动模型下没有防抖窗口，未保存内容本来就在 localStorage 里持久，**不需要这层** |
| `src/lib/saves/legacy.ts` + 测试 | **删除** | 它解决的是「停用 persist 后旧 blob 里的数据怎么办」。本方案**保留 persist**，数据不需要打捞 |
| `src/lib/saves/tree.ts` | **接线** | 启动对账需要它 |
| `src/hooks/useSavesMirror.ts` | **重写** | 拆成 `lib/saves/session.ts`（纯逻辑：基线 / 脏集 / 保存 / 冲突）+ hook 只做 React 接线 |

净效果：**删两个模块（约 220 行 + 300 行测试），接线一个，重写一个。**

## 12. 与「三方比对自动同步」的关系

本方案与全自动同步**共用同一套数据层**（内容哈希 + 基线），差别只在**触发时机**。
将来若想改成自动，只需把 §5 的时机 1–3 换成防抖订阅，数据格式与存储布局不动。
这是选择手动模型不锁死将来的原因。
