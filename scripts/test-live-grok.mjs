import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const executable = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vitest.cmd" : "vitest",
);
const child = spawn(
  executable,
  [
    "run",
    "--config",
    "config/vite.config.ts",
    "--root",
    ".",
    "src/electron/acp/sessionManager.live.test.ts",
  ],
  {
    cwd: projectRoot,
    env: { ...process.env, GROK_GUI_LIVE_TEST: "1" },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
