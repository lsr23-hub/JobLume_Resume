import { spawn } from "node:child_process";
import { resolve } from "node:path";

const browserOnly = process.argv.includes("--browser-only");
const env = {
  ...process.env,
  SAVES_ENABLED: browserOnly ? "0" : "1"
};

const viteCli = resolve("node_modules", "vite", "bin", "vite.js");
const child = spawn(process.execPath, [viteCli, "dev"], {
  env,
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
