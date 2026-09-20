# public/fonts —— 子集化后的 WOFF2

**这个目录里放的是子集化产物，不是原始字体。** 不要直接把下载来的 TTF/OTF 丢进来 —— 一份完整的 CJK 字体带两万多个汉字，单文件 8–16MB，而这里每个只有 0.9–2MB。

## 内容

| 文件 | 字族 | 字重 |
|---|---|---|
| `AlibabaPuHuiTi-3-55-Regular.woff2` | Alibaba PuHuiTi（默认） | 400 |
| `AlibabaPuHuiTi-3-85-Bold.woff2` | 同上 | 700 |
| `MiSans-Normal.woff2` / `MiSans-Medium.woff2` | MiSans | 400 / 700 |
| `NotoSansSC-{Regular,Medium,Bold}.woff2` | Noto Sans SC | 400 / 500 / 700 |
| `HanSerifSC-{Regular,Medium,Bold}.woff2` | Han Serif（原 Source Han Serif，**已按 OFL 改名**） | 400 / 500 / 700 |

前两个由 `src/routes/__root.tsx` **预加载**（首屏就要用）；其余按需加载，用户选了那个字体才拉。

声明的唯一来源是 `src/utils/fonts.ts` 的 `FONT_DEFINITIONS`（运行时）与 `src/app/font.css`（静态）—— 两者必须指向同一批文件。**改一个就要改另一个**，否则会出现「界面用了 A、导出/打印去拉 B 而且 404」这种只在导出时才暴露的问题（曾经真的发生过：`MiSans-Bold.woff2` 从来没存在过）。

## 许可证

四个字族都允许再分发，但条款不同 —— 尤其 Source Han Serif 那条**一开始踩了坑**。

| 字族 | 许可证 | 义务 |
|---|---|---|
| Alibaba PuHuiTi 3 | 阿里巴巴普惠体许可（永久免费商用） | 可随本软件分发；不得单独售卖字体本身 |
| MiSans | MiSans 字体知识产权许可协议 | **必须在软件中注明使用了 MiSans 字体**（见下）；不得对字体外观做单独更改 |
| Noto Sans SC | SIL OFL 1.1 | 随附版权声明与许可证原文 → `LICENSE-NotoSansSC.txt` |
| Han Serif（原 Source Han Serif） | SIL OFL 1.1，**含保留字体名 `'Source'`** | 随附声明 → `LICENSE-SourceHanSerif.txt`；**修改版不得用保留名**，所以子集改了名 |

> **本软件使用了 MiSans 字体**（小米科技有限责任公司）。
>
> 这一句是 MiSans 许可的明确要求（官方 FAQ：「可以[嵌入软件]，但您应在软件中特别注明
> 使用了 MiSans 字体」），不是可选的礼貌。

### 为什么 Han Serif 不叫 Source Han Serif

OFL 的保留字体名条款：**修改版不得使用保留字体名**，而**子集化就是修改版**。
`SourceHanSerifSC-*.woff2` 这个文件名、以及字体内部 `name` 表里的 `Source Han Serif CN`，
**都踩中了那条**。

所以子集化之后跑一遍 `scripts/rename-subset-font.py`：

- 字体内部名改成 `Han Serif CN` / `HanSerifCN-*`
- 文件名改成 `HanSerifSC-*.woff2`
- **版权声明（nameID 0）原样保留并追加一句说明** —— 那是 OFL 要求随附的 notice，
  也正是 RFN 声明的来源，删掉它反而违规

`pnpm subset:fonts` 已内置这一步（见脚本里的 `RENAME_AFTER_SUBSET`），重新生成不会把它带回来。

⚠️ `src/utils/fonts.ts` 的 `aliases` 里**保留**着旧字符串 `"Source Han Serif SC"`：
已保存的简历把那个值存在 `globalSettings` 里，留着它那些简历才解析得到同一套字。
那只是 CSS 里的一个**引用** —— 用户本机装了原字体就用它、没装就落到 `serif`，不涉及再分发。

## 重新生成

```bash
# 1. 把原始字体放进 font-sources/（该目录不进 git）
#    缺什么、去哪下，脚本会打出来
# 2. 需要 python3 + fontTools + brotli
pip install fonttools brotli
pnpm subset:fonts
```

字符表 = GB2312（6763 汉字 + 全套符号）∪ `src/**` 与两份 i18n 文案里出现过的每一个字 ∪ ASCII。取并集里「界面出现过的字」那一项是刻意的：界面自己的字一个都不能缺，否则 UI 会毫无预兆地回退到系统字体。

**已知边界**：生僻字（「龘」「燚」这类）不在表里，简历正文里出现时会回退到系统字体。要覆盖就换个更大的字符表重跑。

## 为什么是 WOFF2 而不是 TTF

`jsPDF` 只吃 TTF，但**当前导出路径根本不读字体文件** —— PDF 是 `html2canvas` 截图后 `addImage` 的纯位图，字体在浏览器渲染那一步就用完了；打印路径（`utils/print.ts`）注入 `@font-face` 让浏览器加载，WOFF2 完全够用。

所以 WOFF2 单套即可。将来若真要做「自绘 PDF 文字层」（`plan/task_plan.md` 的 U3），那才需要另出 TTF 子集 —— 届时脚本加一个 `--flavor` 分支即可，而且 3 个 OTF 字族（Noto Sans SC、Source Han Serif SC）本来就转不成 TTF。
