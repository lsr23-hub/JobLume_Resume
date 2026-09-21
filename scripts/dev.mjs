import { spawn } from "node:child_process";

const browserOnly = process.argv.includes("--browser-only");
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = {
  ...process.env,
  SAVES_ENABLED: browserOnly ? "0" : "1"
};

const child = spawn(command, ["exec", "vite", "dev"], {
  env,
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
