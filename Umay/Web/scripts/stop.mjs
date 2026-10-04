import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = join(root, ".run", "umay-web.pid");

if (!existsSync(pidFile)) {
  console.log("Umay Web için çalışan süreç bulunamadı.");
  process.exit(0);
}

const pid = Number(readFileSync(pidFile, "utf8"));
try {
  process.kill(pid);
  console.log(`Umay Web durduruldu. PID: ${pid}`);
} catch {
  console.log("PID bulunamadı veya zaten durmuş.");
}
rmSync(pidFile, { force: true });
