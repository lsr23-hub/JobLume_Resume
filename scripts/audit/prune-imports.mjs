/**
 * 摘掉未使用的 import 成员。
 *
 * 只处理「具名导入列表」与「整条 default import」，命名空间导入（`* as X`）一律不碰 ——
 * 那种用法里 `X.foo` 的成员静态看不出来，保守不动。
 *
 * 用法：
 *   node scripts/audit/prune-imports.mjs            # 预览
 *   node scripts/audit/prune-imports.mjs --write    # 落盘
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../src");
const WRITE = process.argv.includes("--write");
const SKIP = [/routeTree\.gen\.ts$/];

const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
};

const IMPORT_RE = /^(\s*)import\s+(type\s+)?([\s\S]*?)\s+from\s+(["'][^"']+["']);?$/gm;
const isUsed = (body, n) => new RegExp(`\\b${n.replace(/\$/g, "\\$")}\\b`).test(body);

let changedFiles = 0, removedTotal = 0;

for (const f of walk(ROOT)) {
  if (SKIP.some((re) => re.test(f))) continue;
  const src = fs.readFileSync(f, "utf8");
  const body = src.replace(IMPORT_RE, "");
  let removed = 0;

  const next = src.replace(IMPORT_RE, (full, indent, typeKw, clause, spec) => {
    // 命名空间导入不动
    if (/\*\s+as\s+/.test(clause)) return full;
    const braces = clause.match(/\{([\s\S]*)\}/);
    const before = braces ? clause.slice(0, braces.index).trim().replace(/,\s*$/, "") : clause.trim();

    // default import 未使用 → 整条删（只有在没有具名部分时）
    const defMatch = before.match(/^([A-Za-z_$][\w$]*)$/);
    if (defMatch && !braces) {
      if (isUsed(body, defMatch[1])) return full;
      removed++;
      return `__DROP__`;
    }

    if (!braces) return full;
    const parts = braces[1].split(",").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((p) => {
      const n = p.replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim();
      if (!n || !/^[A-Za-z_$][\w$]*$/.test(n)) return true; // 认不出就保留
      return isUsed(body, n);
    });
    removed += parts.length - kept.length;
    if (kept.length === parts.length) return full;
    if (kept.length === 0 && !before) return "__DROP__";
    const named = `{ ${kept.join(", ")} }`;
    return `${indent}import ${typeKw ?? ""}${before ? before + ", " : ""}${named} from ${spec};`;
  })
    .split("\n")
    .filter((l) => l.trim() !== "__DROP__")
    .join("\n");

  if (removed > 0) {
    changedFiles++;
    removedTotal += removed;
    console.log(`  ${path.relative(ROOT, f)}  −${removed}`);
    if (WRITE) fs.writeFileSync(f, next, "utf8");
  }
}
console.log(`\n${WRITE ? "已写入" : "预览"}：${changedFiles} 个文件 / ${removedTotal} 个成员`);
if (!WRITE && removedTotal) console.log("加 --write 落盘");
