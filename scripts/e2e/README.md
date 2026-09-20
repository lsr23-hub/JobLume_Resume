# 端到端实测（真实浏览器）

验证「职业数据库 → 简历 → 导出」这条主链路。用 Playwright 驱动真实 Chromium，
跑在**已经起着的 dev server** 上。

## 跑法

```bash
pnpm dev                      # 另开一个终端
pnpm e2e:core                 # 主链路：生成 → 4 套模板 → 导出 → PDF 文字层
pnpm e2e:picker               # 编辑器「从职业数据库挑选」
pnpm e2e:legacy               # 老简历用了已删模板时的回退
```

环境变量：`E2E_BASE`（默认 `http://localhost:3000`）、`E2E_OUT`（截图与 PDF 落盘目录，默认 `/tmp/jl2`）。

## 两个脚本各自验什么

**`core-flow.mjs`（16 项）**

- 灌一份带项目经历的档案 → 数据库页显示条目
- 走完生成向导 → 跳到工作台 → 预览里出现项目名称 / 角色 / 描述要点
- **4 套模板逐一切换**，每套都断言项目板块渲染出来了
- 点导出 → 抓下打印管线真正生成的那份 HTML（补丁掉 `print()`，headless 没有打印对话框）
- 把那份 HTML 交给 Chromium 打印引擎出 PDF，再从 PDF 文字层核对内容

**`editor-picker.mjs`（9 项）**

- 在编辑器里删掉项目经历 → 确认简历里没了
- 点「添加项目」→ 从职业数据库挑选 → 加入 → 确认字段（含角色）一并带入

**`legacy-template.mjs`（6 项）**

- 把一份简历的 `templateId` 改成本次精简删掉的模板（`swiss`）
- 断言它照常渲染（回退到 `DEFAULT_TEMPLATES[0]` = classic）、项目经历仍在、无页面错误
- 这是精简模板对**已有用户**的真实风险，不能只靠「代码里有兜底」这句话

## 已知缺陷：导出的 PDF 文字层有康熙部首

`core-flow` 第 ⑨ 项在**归一化后**断言，并打印实测比例（约 11% 的汉字是康熙部首）。
裸文本匹配会失败，这不是脚本写错，是 Chromium 的 ToUnicode 生成问题 —— 成因、
影响与取舍写在 [docs/04 §8.2](../../docs/04-development-plan.md)。

**2026-09-19 补充：这条缺陷已确认可修。** A/B 对照同一段文字：Chromium 打印 11/20 个汉字
成康熙部首，而 `jspdf` 自绘 0 个。条件是 jsPDF 只支持 TrueType（项目 6 个 OTF 字体不可用），
且 4 套模板的版面复刻尚未验证。详见 `plan/notes.md` §七。

## 注意

- 这两个脚本**不进 `pnpm test`**：它们要一个跑着的服务端，且单次要几十秒。
  它们是「改完主链路后手工跑一遍」的验收工具，不是单元测试。
- 每个脚本自建浏览器上下文，`localStorage` 从空开始灌数据，因此可以独立重跑。
- ⚠️ **会新建用户的脚本必须 `import` 一次 `./userScope.mjs`** —— 那个 import 顺带注册了
  退出时的清扫钩子（`process.on("exit", sweepNewSaves)`），它只删本次运行新建的
  `saves/<uid>/` 目录。少了这行 import，脚本建的目录会**留在盘上变成孤儿**，
  而且界面上看不出来（应用只从 `localStorage` 读用户，不看磁盘），只能靠 `ls saves/` 发现。
