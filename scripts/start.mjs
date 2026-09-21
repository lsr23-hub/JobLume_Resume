import { spawn } from "node:child_process";

const command = process.execPath;
const child = spawn(command, ["server.mjs"], {
  env: { ...process.env, SAVES_ENABLED: "1" },
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
