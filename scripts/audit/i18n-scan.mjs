import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/locales", f), "utf8"));
const zh = load("zh.json"), en = load("en.json");

const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? flat(v, p + k + ".") : [p + k]
  );
const zhKeys = new Set(flat(zh)), enKeys = new Set(flat(en));

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const used = new Map(); // fullkey -> Set(files)
for (const f of walk(path.join(ROOT, "src"))) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(ROOT, f);

  // Map each translator VARIABLE to its namespace:  const tSection = useTranslations("profile")
  const varNs = new Map();
  for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:["']([^"']*)["'])?\s*\)/g)) {
    varNs.set(m[1], m[2] ?? "");
  }
  if (varNs.size === 0) continue;

  for (const [v, ns] of varNs) {
    // calls on this exact variable only:  tSection("x")  /  t("x")
    const re = new RegExp(`\\b${v}\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
    for (const m of src.matchAll(re)) {
      const full = ns ? `${ns}.${m[1]}` : m[1];
      if (!used.has(full)) used.set(full, new Set());
      used.get(full).add(rel);
    }
  }
}

const report = (label, keys) => {
  const miss = [...used.keys()].filter(k => !keys.has(k)).sort();
  console.log(`\n=== ${label} === 共 ${miss.length} 条`);
  for (const k of miss) console.log("  " + k + "   <- " + [...used.get(k)].slice(0, 2).join(", "));
};
report("代码用了、zh.json 没有", zhKeys);
report("代码用了、en.json 没有", enKeys);

const unused = [...zhKeys].filter(k => {
  if (used.has(k)) return false;
  const parts = k.split(".");
  for (let i = 1; i < parts.length; i++) if (used.has(parts.slice(0, i).join("."))) return false;
  return true;
});
console.log(`\n=== zh.json 定义但静态扫不到使用者 === 共 ${unused.length} / ${zhKeys.size}`);
const byNs = {};
for (const k of unused) { const n = k.split(".")[0]; byNs[n] = (byNs[n] || 0) + 1; }
console.log("  按顶层命名空间:", JSON.stringify(byNs));
