/**
 * 体量快照 —— 用于回答「这次清理到底瘦了多少」。
 *
 * 统计口径刻意分开，因为它们的含义不同：
 *  · src 行数：源码体量（含空行与注释 —— 注释是这个项目的资产，不单列）
 *  · 运行时产物体积：用户实际下载的东西
 *  · 依赖数与安装体积：开发环境的负担
 *
 * 用法：node scripts/audit/size-report.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

// —— 源码体量 ——
const srcFiles = walk(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const scriptFiles = walk(path.join(ROOT, "scripts")).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
const count = (files) => files.reduce((n, f) => n + fs.readFileSync(f, "utf8").split("\n").length, 0);
const bytes = (files) => files.reduce((n, f) => n + fs.statSync(f).size, 0);

// —— 依赖 ——
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// —— 构建产物 ——
const distClient = path.join(ROOT, "dist/client");
const distFiles = fs.existsSync(distClient) ? walk(distClient) : [];

const kb = (b) => (b / 1024).toFixed(0) + " KB";
const mb = (b) => (b / 1024 / 1024).toFixed(1) + " MB";

const report = {
  "src 文件数": srcFiles.length,
  "src 行数": count(srcFiles),
  "src 字节": bytes(srcFiles),
  "scripts 文件数": scriptFiles.length,
  "scripts 行数": count(scriptFiles),
  "依赖数 (dependencies)": Object.keys(pkg.dependencies ?? {}).length,
  "依赖数 (devDependencies)": Object.keys(pkg.devDependencies ?? {}).length,
  "dist/client 文件数": distFiles.length,
  "dist/client 字节": distFiles.reduce((n, f) => n + fs.statSync(f).size, 0),
  "dist/client JS 字节": distFiles.filter((f) => f.endsWith(".js")).reduce((n, f) => n + fs.statSync(f).size, 0),
  "dist/client CSS 字节": distFiles.filter((f) => f.endsWith(".css")).reduce((n, f) => n + fs.statSync(f).size, 0),
  "dist/client 字体字节": distFiles.filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).reduce((n, f) => n + fs.statSync(f).size, 0),
  "dist/client 图片字节": distFiles.filter((f) => /\.(png|jpg|jpeg|svg|ico|webp)$/.test(f)).reduce((n, f) => n + fs.statSync(f).size, 0),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [k, v] of Object.entries(report)) {
    const shown = typeof v === "number" && v > 100000 ? `${v}  (${mb(v)})` : v;
    console.log(`  ${k.padEnd(28)} ${shown}`);
  }
}
