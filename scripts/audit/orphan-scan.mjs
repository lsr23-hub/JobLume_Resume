import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../src");

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const files = walk(ROOT);
const set = new Set(files);

// Map every module specifier used anywhere to a resolved file path
const imported = new Set();
const specifierRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = specifierRe.exec(src))) {
    const spec = m[1];
    let base;
    if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(f), spec);
    else continue;

    for (const cand of [
      base,
      base + ".ts",
      base + ".tsx",
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ]) {
      if (set.has(cand)) imported.add(cand);
    }
  }
}

// Entry points that are never imported but are legitimately used
const ENTRIES = [
  "routeTree.gen.ts", "router.tsx", "vite-env.d.ts", "types/global.d.ts",
];
const isEntry = (f) =>
  /\/routes\//.test(f) ||
  ENTRIES.some((e) => f.endsWith(e)) ||
  /\.test\.ts$/.test(f) ||
  /\.d\.ts$/.test(f);

const orphans = files.filter((f) => !imported.has(f) && !isEntry(f));
console.log("=== 无任何 import 方（含相对路径、@/别名、index 兜底）===");
for (const o of orphans.sort()) console.log("  " + path.relative(ROOT, o));
console.log("\n总计:", orphans.length, "/", files.length, "个文件");
