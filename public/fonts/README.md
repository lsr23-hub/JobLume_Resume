# public/fonts —— 子集化后的 WOFF2

**这个目录里放的是子集化产物，不是原始字体。** 不要直接把下载来的 TTF/OTF 丢进来 —— 一份完整的 CJK 字体带两万多个汉字，单文件 8–16MB，而这里每个只有 0.9–2MB。

## 内容

| 文件 | 字族 | 字重 |
|---|---|---|
| `AlibabaPuHuiTi-3-55-Regular.woff2` | Alibaba PuHuiTi（默认） | 400 |
| `AlibabaPuHuiTi-3-85-Bold.woff2` | 同上 | 700 |
| `MiSans-Normal.woff2` / `MiSans-Medium.woff2` | MiSans | 400 / 700 |
| `NotoSansSC-{Regular,Medium,Bold}.woff2` | Noto Sans SC | 400 / 500 / 700 |
| `SourceHanSerifSC-{Regular,Medium,Bold}.woff2` | Source Han Serif SC | 400 / 500 / 700 |

前两个由 `src/routes/__root.tsx` **预加载**（首屏就要用）；其余按需加载，用户选了那个字体才拉。

声明的唯一来源是 `src/utils/fonts.ts` 的 `FONT_DEFINITIONS`（运行时）与 `src/app/font.css`（静态）—— 两者必须指向同一批文件。**改一个就要改另一个**，否则会出现「界面用了 A、导出/打印去拉 B 而且 404」这种只在导出时才暴露的问题（曾经真的发生过：`MiSans-Bold.woff2` 从来没存在过）。

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
