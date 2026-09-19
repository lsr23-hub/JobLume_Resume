/**
 * 把 `font-sources/` 下的原始字体子集化成 `public/fonts/` 下的 WOFF2。
 *
 * **为什么要做**：一份完整的 CJK 字体带两万多个汉字，而一个简历工具用到的日常
 * 中文最多几千。实测 `AlibabaPuHuiTi` 一个字重 8.1MB → 0.9MB，而首屏要预加载
 * 两个字重 —— 也就是 **16.1MB → 1.8MB**。这是整个项目包体里最大的一块。
 *
 * **字符表**（三个来源取并集）：
 * 1. GB2312 —— 6763 个汉字加全套符号，覆盖日常中文、人名、地名
 * 2. **界面里出现过的每一个字** —— 扫 `src/**` 与两份 i18n 文案。这一项是刻意的：
 *    界面自己的字一个都不能缺，否则 UI 会毫无预兆地回退到系统字体
 * 3. ASCII 与常用标点
 *
 * **代价**：生僻字（如「龘」「燚」这类非常用字）不在表里，会回退到系统字体。
 * 简历正文里出现这类字时会换字形 —— 要覆盖就换个更大的字符表重跑本脚本。
 *
 * **跑法**：`pnpm subset:fonts`
 * **依赖**：`python3` + `fontTools` + `brotli`。只在**重新生成**时需要 ——
 * 产物是提交进库的，日常构建不需要 Python。
 *
 * 原始字体（~113MB）在 `font-sources/` 下、不进 git，脚本会告诉你缺哪个、去哪下。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FONT_DEFINITIONS } from "../src/utils/fonts";

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, "font-sources");
const OUT_DIR = path.join(ROOT, "public", "fonts");

/** 原始字体去哪下 —— 缺文件时打出来，省得下次再找 */
const WHERE_TO_GET: Record<string, string> = {
  AlibabaPuHuiTi: "https://fonts.alibabagroup.com/ （阿里巴巴普惠体 3.0）",
  MiSans: "https://hyperos.mi.com/font/ （小米 MiSans）",
  NotoSansSC: "https://fonts.google.com/noto/specimen/Noto+Sans+SC",
  SourceHanSerifSC: "https://github.com/adobe-fonts/source-han-serif/releases",
};

// ─────────────────────────── 字符表 ───────────────────────────

/** GB2312 全集：6763 汉字 + 全套符号。Node 自带这个解码器，不必额外依赖 */
const gb2312Chars = (): string => {
  const decoder = new TextDecoder("gb2312");
  const out: string[] = [];
  for (let hi = 0xa1; hi <= 0xf7; hi += 1) {
    for (let lo = 0xa1; lo <= 0xfe; lo += 1) {
      const ch = decoder.decode(new Uint8Array([hi, lo]));
      if (ch.length === 1 && ch !== "�") out.push(ch);
    }
  }
  return out.join("");
};

const ASCII_AND_PUNCT =
  Array.from({ length: 0x7f - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join("") +
  "　、。〈〉《》「」『』【】〔〕・ー―‐–—‘’“”…※←→↑↓■□●○◆◇★☆℃￥€£§¶†‡•‰′″±×÷≈≠≤≥∞°√∫";

/** 扫源码与文案，把界面可能渲染出来的字全收进来 */
const walkChars = (dir: string, accept: (f: string) => boolean, into: Set<string>) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walkChars(full, accept, into);
      continue;
    }
    if (!accept(name)) continue;
    for (const ch of readFileSync(full, "utf8")) {
      const cp = ch.codePointAt(0)!;
      // 只收非 ASCII，ASCII 已经在上面那份里了
      if (cp > 0x7f) into.add(ch);
    }
  }
};

export const collectCharset = (): string => {
  const set = new Set<string>();
  for (const ch of gb2312Chars()) set.add(ch);
  for (const ch of ASCII_AND_PUNCT) set.add(ch);
  walkChars(path.join(ROOT, "src"), (f) => /\.(ts|tsx|json)$/.test(f), set);
  return Array.from(set).sort().join("");
};

// ─────────────────────────── 生成 ───────────────────────────

const findSource = (base: string): string | null => {
  for (const ext of ["ttf", "otf"]) {
    const full = path.join(SOURCE_DIR, `${base}.${ext}`);
    if (existsSync(full)) return full;
  }
  return null;
};

const kb = (bytes: number) => `${Math.round(bytes / 1024)}KB`;

const main = () => {
  const charset = collectCharset();
  const charsetFile = path.join(os.tmpdir(), "joblume-font-subset-chars.txt");
  writeFileSync(charsetFile, charset, "utf8");
  console.log(`字符表 ${charset.length} 个字符（GB2312 ∪ 界面文案 ∪ ASCII）`);
  console.log(`        → ${charsetFile}\n`);

  // 同一个 url 可能在多个字族里出现，去重
  const wanted = new Map<string, { url: string; family: string }>();
  for (const def of FONT_DEFINITIONS) {
    for (const src of def.sources) wanted.set(src.url, { url: src.url, family: src.family });
  }

  let before = 0;
  let after = 0;
  const missing: string[] = [];

  for (const { url } of wanted.values()) {
    const base = path.basename(url).replace(/\.woff2$/, "");
    const source = findSource(base);
    if (!source) {
      missing.push(base);
      continue;
    }

    const out = path.join(OUT_DIR, `${base}.woff2`);
    execFileSync(
      "python3",
      ["-m", "fontTools.subset", source, `--text-file=${charsetFile}`, "--flavor=woff2",
       "--layout-features=*", "--no-hinting", `--output-file=${out}`],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    const a = statSync(source).size;
    const b = statSync(out).size;
    before += a;
    after += b;
    console.log(`  ${base.padEnd(34)} ${kb(a).padStart(7)} → ${kb(b).padStart(6)}  (-${100 - Math.round((b * 100) / a)}%)`);
  }

  if (missing.length > 0) {
    console.error(`\n❌ 缺 ${missing.length} 个原始字体，去下面这些地方下，放进 font-sources/：`);
    for (const base of missing) {
      const vendor = Object.keys(WHERE_TO_GET).find((k) => base.startsWith(k));
      console.error(`   ${base}  ← ${vendor ? WHERE_TO_GET[vendor] : "（来源不明，见 git 历史）"}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n合计 ${kb(before)} → ${kb(after)}  (-${100 - Math.round((after * 100) / before)}%)`);
  console.log("产物在 public/fonts/，它们是要提交进库的。");
};

main();
