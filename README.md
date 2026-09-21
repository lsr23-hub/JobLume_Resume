# 职光简历 · JobLume Resume

一个本地优先的求职工具：把经历整理成职业数据库，再按岗位生成和管理多份简历。

> 本项目基于 [Magic Resume](https://github.com/JOYCEQL/magic-resume) v2.0.8 二次开发。上游来源、许可证和附加条款见 [NOTICE](./NOTICE) 与 [LICENSE](./LICENSE)。

## 功能

- **职业数据库**：管理基本信息、教育、工作、技能、证书、项目、自我评价、校园经历、荣誉和语言能力。
- **多份简历**：从同一份职业数据库创建多份简历，单独调整内容、模板和排版。
- **岗位目标**：保存 JD，记录岗位要求和匹配分析。
- **AI 辅助**：可选的 DeepSeek API 支持岗位匹配、标签分析和内容选择；未配置 API Key 时，手动编辑和导出仍可使用。
- **四套模板**：`classic`、`modern`、`left-right`、`timeline`。
- **导出**：浏览器打印 PDF、长页 PDF、PNG、JSON 和 Markdown。
- **备份与存档**：导出/导入包含职业数据库、简历、岗位目标和图片的 ZIP 备份；自建部署可把数据保存到磁盘。

## 快速开始

要求：Node.js 20+、pnpm 10+。Windows 用户建议使用 PowerShell。

Windows 如果尚未安装 pnpm，可先启用 Node.js 自带的 Corepack：

```powershell
corepack enable
corepack prepare pnpm@10.3.0 --activate
```

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:3000>。开发服务器默认启用本地存档功能；如只想使用浏览器本地数据，可运行：

```bash
pnpm dev:browser-only
```

`pnpm dev`、`pnpm dev:browser-only` 和 `pnpm start` 已使用跨平台环境变量写法，Windows、macOS 和 Linux 都可以直接执行。

常用检查：

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

## AI 配置

在应用的 **AI 配置** 页面填写 DeepSeek API Key。Key 保存在当前浏览器的本地存储中，请不要把它写入仓库、截图或访问日志。

使用 AI 功能时，浏览器会把请求和 Key 发给本项目服务端，再由服务端转发到上游模型服务。服务端不会把 Key 写入 `saves/`，但部署者仍能在运行时接触请求内容，因此只应把请求发给你信任的服务端。

## 数据与存档

应用有两种数据形态：

1. **浏览器数据**：Zustand 持久化到 `localStorage`，IndexedDB 用于图片缓存和浏览器端降级。
2. **磁盘存档**：启用 `SAVES_ENABLED=1` 后，服务端把数据写入 `saves/<userId>/`。磁盘是自建部署中的权威副本，浏览器是工作副本。

磁盘存档结构大致如下：

```text
saves/<userId>/
├── .baseline.json
├── profile.json
├── resumes/<resumeId>.json
├── jds/<targetId>.json
└── images/<imageId>.<ext>
```

`saves/` 包含姓名、联系方式、经历和图片，已被 `.gitignore` 忽略，**不要把它加入 Git 或上传到公开仓库**。

应用通过明确的保存时机写盘，并在启动时检查浏览器数据、磁盘数据和基线之间的差异。冲突需要用户选择，不会自动覆盖两边内容。

## 自建部署

### Docker Compose

```bash
mkdir -p saves
docker compose up -d
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force saves
docker compose up -d
```

默认配置：

- 访问地址绑定到 `127.0.0.1:3000`；
- 数据通过 `./saves:/data/saves` 挂载到宿主机；
- `SAVES_ENABLED=1`；
- 容器以非 root 用户运行，若宿主机权限不足，请调整 `saves/` 的写权限。

如需让其他机器访问，请先配置认证，再修改 `docker-compose.yml` 的端口绑定。当前 `/api/saves` 没有内置账号体系：能访问站点的人可以读写该存档目录中的数据。推荐在 Caddy、nginx 或 Cloudflare Access 等反向代理层加认证。

### Node

```bash
pnpm install
pnpm build
pnpm start
```

默认端口是 `3000`。常用环境变量：

| 变量 | 作用 |
|---|---|
| `SAVES_ENABLED` | `1` 启用服务端存档；其他值关闭存档端点 |
| `SAVES_ROOT` | 存档父目录，数据写入 `<SAVES_ROOT>/saves/` |
| `TRUST_PROXY` | 仅在可信反向代理后设为 `1`，用于读取代理传来的来源 IP |
| `PORT` | HTTP 端口，默认 `3000` |
| `HOSTNAME` | 监听地址；本机使用可设为 `127.0.0.1` |
| `SITE_URL` | 构建期站点地址，用于生成绝对 URL |

完整说明见 [.env.example](./.env.example)。

### 对外部署前检查

- `SAVES_ENABLED=1` 时，先给 `/api/saves` 和图片接口加认证。
- 反向代理后才设置 `TRUST_PROXY=1`；直接暴露端口时不要设置，否则客户端可以伪造转发头。
- 访问日志不要记录请求体。请求体可能包含简历内容和 API Key。
- 使用 HTTPS，并限制备份文件和 `saves/` 目录的读取权限。

如果只是静态托管或单机使用，可以关闭 `SAVES_ENABLED`，让数据只保存在浏览器中。

## 健康检查

服务端提供：

```text
GET /healthz
HEAD /healthz
```

成功时返回 `200`，JSON 中包含 `status`、`uptimeSec` 和 `rateLimitMode`。

## 开发

主要目录：

```text
docs/                 设计、数据模型、算法和 API 文档
public/               字体、图标、模板截图和演示素材
src/config/           默认数据、板块和 AI 配置
src/store/            浏览器端状态
src/lib/profile/      职业档案和简历生成逻辑
src/lib/match/        岗位匹配、提示词和结果校验
src/lib/saves/        磁盘存档和冲突处理
src/lib/server/       存档读写、限流和模型转发
src/routes/api/       `/api/match`、`/api/tag`、`/api/saves`
scripts/              评测、字体处理和端到端验收脚本
```

生成字体子集需要额外的原始字体文件。原始 TTF/OTF 放在 `font-sources/`，该目录不入 Git；流程见 [public/fonts/README.md](./public/fonts/README.md)。

端到端脚本需要先启动开发服务器和 Chromium，具体命令见 [scripts/e2e/README.md](./scripts/e2e/README.md)。

## 文档

- [产品需求](./docs/01-PRD.md)
- [数据模型](./docs/02-data-model.md)
- [简历生成算法](./docs/03-generation-algorithm.md)
- [API 与配置](./docs/05-api-and-config.md)
- [评测设计](./docs/07-eval-design.md)
- [评测报告](./docs/08-eval-report.md)
- [上游来源清单](./docs/upstream-derivation.md)

## 许可证与来源

本项目是 Magic Resume v2.0.8 的衍生作品。修改文件和逐文件来源见 [docs/upstream-derivation.md](./docs/upstream-derivation.md)，字体许可证见 [public/fonts/](./public/fonts/)。

完整许可文本见 [LICENSE](./LICENSE)。使用、修改、部署或再分发前，请按该文件中的条款执行。
