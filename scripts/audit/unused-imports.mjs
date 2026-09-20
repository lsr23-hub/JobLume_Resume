/**
 * 找出「导入了但没用到」的标识符。
 *
 * 为什么需要它：`tsc` 不报未使用的 import（没开 noUnusedLocals），
 * 而项目的 eslint 配置还在 extend `next/core-web-vitals` —— 那是迁移前的
 * 遗留，包已卸载，eslint 根本跑不起来（见 health-report）。所以这块目前无人守。
 *
 * 口径：把 import 语句整段切掉后，在剩余源码里按词边界找该标识符。
 * 近似但够用 —— 注释里提到同名标识符会误判为「已使用」，宁可漏报不误报。
 *
 * 用法：node scripts/audit/unused-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../src");
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

const IMPORT_RE = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["'][^"']+["'];?/gm;
const findings = [];

for (const f of walk(ROOT)) {
  const src = fs.readFileSync(f, "utf8");
  // 去掉 import 段，剩下的才是「使用处」
  const body = src.replace(IMPORT_RE, "");
  const names = [];

  for (const m of src.matchAll(IMPORT_RE)) {
    const clause = m[1].trim();
    // default import
    const def = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (def && !clause.startsWith("{")) names.push(def[1]);
    // named imports
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const n = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
        if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.push(n);
      }
    }
    // namespace import
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (ns) names.push(ns[1]);
  }

  const unused = names.filter((n) => {
    const re = new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`);
    return !re.test(body);
  });
  // 去重（同一名字可能来自多行 import）
  const uniq = [...new Set(unused)];
  if (uniq.length) findings.push({ file: path.relative(ROOT, f), names: uniq });
}

if (findings.length === 0) {
  console.log("没有发现未使用的 import。");
} else {
  let total = 0;
  for (const { file, names } of findings.sort((a, b) => b.names.length - a.names.length)) {
    console.log(`  ${file}`);
    console.log(`      ${names.join(", ")}`);
    total += names.length;
  }
  console.log(`\n共 ${findings.length} 个文件 / ${total} 个标识符`);
}
