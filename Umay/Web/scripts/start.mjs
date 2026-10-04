import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runDir = join(root, ".run");
const pidFile = join(runDir, "umay-web.pid");
const logFile = join(runDir, "umay-web.log");
const port = process.env.VITE_WEB_PORT || process.env.PORT || "9056";

if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
if (existsSync(pidFile)) {
  const oldPid = Number(readFileSync(pidFile, "utf8"));
  if (oldPid) {
    try {
      process.kill(oldPid, 0);
      console.log(`Umay Web zaten çalışıyor. PID: ${oldPid}`);
      process.exit(0);
    } catch {
      /* eski pid geçersiz */
    }
  }
}

const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const out = openSync(logFile, "a");
const child = spawn(
  process.execPath,
  [viteBin, "--host", "0.0.0.0", "--port", port],
  {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, VITE_WEB_PORT: port }
  }
);

child.unref();
closeSync(out);
writeFileSync(pidFile, String(child.pid));
console.log(`Umay Web başladı: http://localhost:${port}`);
console.log(`PID: ${child.pid}`);
console.log(`Log: ${logFile}`);
