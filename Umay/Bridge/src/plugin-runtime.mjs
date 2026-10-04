import { createHash, verify as verifySignatureBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { platform as osPlatform } from "node:os";

const SECRET_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key|token|secret|password)(["'\s:=]+)["']?([^"'\s]+)/gi
];

export function maskSecrets(input = "") {
  let out = String(input);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix = "") => {
      if (String(prefix).toLowerCase().startsWith("bearer")) return `${prefix}[REDACTED]`;
      return match.replace(/([^"'\s:=]+)$/, "[REDACTED]");
    });
  }
  return out;
}

export function validateManifest(manifest = {}) {
  if (!manifest || typeof manifest !== "object") throw new Error("Manifest missing.");
  if (manifest.download_url && typeof manifest.download_url !== "string") {
    throw new Error("Manifest download_url must be a string.");
  }
  if (manifest.download && typeof manifest.download !== "object") {
    throw new Error("Manifest download must be an object.");
  }
  if (manifest.start && typeof manifest.start !== "object") {
    throw new Error("Manifest start must be an object.");
  }
  if (manifest.start?.command && typeof manifest.start.command !== "string") {
    throw new Error("Manifest start.command must be a string.");
  }
  if (manifest.start?.args && !Array.isArray(manifest.start.args)) {
    throw new Error("Manifest start.args must be a list.");
  }
  if (manifest.dependencies?.commands && !Array.isArray(manifest.dependencies.commands)) {
    throw new Error("Manifest dependencies.commands must be a list.");
  }
  return true;
}

function commandExists(command) {
  if (!command || typeof command !== "string") return false;
  const probe = osPlatform() === "win32"
    ? spawnSync("where", [command], { stdio: "ignore" })
    : spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`]);
  return probe.status === 0;
}

function runtimeCommandForPackage(manifest = {}) {
  const download = manifest.download || {};
  if (download.command && typeof download.command === "string") return download.command;
  const packageName = String(download.package || "").toLowerCase();
  const map = {
    opencode: "opencode",
    openhands: "openhands",
    n8n: "n8n",
    comfyui: "comfyui"
  };
  return map[packageName] || String(download.package || "");
}

export function runtimeAvailabilityReport(packages = ["opencode", "openhands", "n8n", "comfyui"]) {
  return packages.map((item) => {
    const config = typeof item === "string" ? { package: item } : item || {};
    const packageName = String(config.package || config.name || "");
    const command = runtimeCommandForPackage({ download: { package: packageName, command: config.command } });
    const available = commandExists(command);
    return {
      package: packageName,
      command,
      available,
      reason: available ? null : `${packageName || command}_runtime_not_installed`
    };
  });
}

function writeBridgeResolvedLauncher({ installDir, installationId, manifest, command }) {
  const download = manifest.download || {};
  const packageName = String(download.package || command || "runtime");
  const args = Array.isArray(download.args) ? download.args.map(String) : [];
  const launcherPath = join(installDir, "launcher.mjs");
  writeFileSync(
    launcherPath,
    [
      "import { spawn } from 'node:child_process';",
      "import { appendFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      `const command = ${JSON.stringify(command)};`,
      `const args = ${JSON.stringify(args)};`,
      `const logPath = join(process.cwd(), ${JSON.stringify(`${installationId}.runtime.log`)});`,
      "appendFileSync(logPath, `${new Date().toISOString()} starting ${command}\\n`);",
      "const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });",
      "child.stdout.on('data', (chunk) => appendFileSync(logPath, chunk));",
      "child.stderr.on('data', (chunk) => appendFileSync(logPath, chunk));",
      "child.on('exit', (code) => appendFileSync(logPath, `${new Date().toISOString()} exited ${code}\\n`));"
    ].join("\n")
  );
  writeFileSync(
    join(installDir, "runtime-resolved.json"),
    JSON.stringify({
      type: "bridge-resolved",
      package: packageName,
      command,
      args,
      launcher: launcherPath
    }, null, 2)
  );
  return launcherPath;
}

function bridgeResolvedStart({ appDir, installationId, manifest }) {
  const download = manifest.download || {};
  if (download.type !== "bridge-resolved") return null;
  const command = runtimeCommandForPackage(manifest);
  if (!commandExists(command)) {
    throw new Error(`${download.package || command}_runtime_not_installed`);
  }
  const installDir = join(appDir, "plugins", installationId);
  const launcherPath = writeBridgeResolvedLauncher({ installDir, installationId, manifest, command });
  return {
    command: process.execPath,
    args: [launcherPath],
    cwd: installDir
  };
}

export function parseChecksum(checksum = "") {
  if (!checksum) return null;
  const [algorithm, value] = checksum.split(":");
  if (algorithm !== "sha256" || !value || !/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("Only sha256:<hex> checksums are supported.");
  }
  return { algorithm, value: value.toLowerCase() };
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function verifyChecksum(path, checksum) {
  const parsed = parseChecksum(checksum);
  if (!parsed) return true;
  const actual = await sha256File(path);
  if (actual !== parsed.value) {
    throw new Error(`Checksum mismatch: expected ${parsed.value}, got ${actual}`);
  }
  return true;
}

export function verifyPluginSignature({ checksum, signature, publicKey }) {
  if (!signature) return true;
  if (!publicKey) throw new Error("Plugin signature public key missing.");
  const [scheme, value] = String(signature).split(":");
  if (scheme !== "ed25519" || !value) throw new Error("Only ed25519:<base64> signatures are supported.");
  const ok = verifySignatureBytes(
    null,
    Buffer.from(String(checksum || ""), "utf8"),
    publicKey,
    Buffer.from(value, "base64")
  );
  if (!ok) throw new Error("Plugin signature verification failed.");
  return true;
}

export function probeDependencies(manifest = {}) {
  const commands = manifest.dependencies?.commands || [];
  const missing = [];
  for (const command of commands) {
    if (typeof command !== "string" || !command.trim()) {
      missing.push(String(command));
      continue;
    }
    const probe = osPlatform() === "win32"
      ? spawnSync("where", [command], { stdio: "ignore" })
      : spawnSync("sh", ["-lc", `command -v ${JSON.stringify(command)} >/dev/null 2>&1`]);
    if (probe.status !== 0) missing.push(command);
  }
  if (missing.length) throw new Error(`Missing plugin dependencies: ${missing.join(", ")}`);
  return true;
}

async function downloadFile(url, targetPath) {
  if (url.startsWith("file://")) {
    const source = new URL(url);
    await pipeline(createReadStream(source), createWriteStream(targetPath));
    return targetPath;
  }
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(response.body, createWriteStream(targetPath));
  return targetPath;
}

export async function installPlugin({ appDir, installationId, manifest, checksum, signature, preserveData = true }) {
  validateManifest(manifest);
  probeDependencies(manifest);
  verifyPluginSignature({
    checksum: checksum || manifest.checksum,
    signature: signature || manifest.signature,
    publicKey: manifest.signature_public_key || process.env.UMAY_PLUGIN_PUBLIC_KEY
  });
  const pluginsDir = join(appDir, "plugins");
  const installDir = join(pluginsDir, installationId);
  const dataDir = join(appDir, "plugin-data", installationId);
  const stagingDir = join(appDir, "staging", `${installationId}-${Date.now()}`);
  mkdirSync(stagingDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  if (preserveData) mkdirSync(dataDir, { recursive: true });
  try {
    let packagePath = null;
    if (manifest.download_url) {
      packagePath = join(stagingDir, basename(new URL(manifest.download_url).pathname) || "plugin.bin");
      await downloadFile(manifest.download_url, packagePath);
      await verifyChecksum(packagePath, checksum || manifest.checksum);
    }
    writeFileSync(join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    writeFileSync(join(stagingDir, "install.json"), JSON.stringify({
      installed_at: new Date().toISOString(),
      package: packagePath ? basename(packagePath) : null,
      data_dir: dataDir
    }, null, 2));
    if (manifest.download?.type === "bridge-resolved") {
      const command = runtimeCommandForPackage(manifest);
      writeBridgeResolvedLauncher({ installDir: stagingDir, installationId, manifest, command });
    }
    if (existsSync(installDir)) rmSync(installDir, { recursive: true, force: true });
    renameSync(stagingDir, installDir);
    return { installed_path: installDir, data_dir: dataDir };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export function startPlugin({ appDir, installationId, manifest, env = {} }) {
  validateManifest(manifest);
  probeDependencies(manifest);
  const resolvedStart = manifest.start?.command
    ? manifest.start
    : bridgeResolvedStart({ appDir, installationId, manifest });
  if (!resolvedStart?.command) {
    return { runtime_status: "STOPPED", note: "No start command declared." };
  }
  const installDir = join(appDir, "plugins", installationId);
  const logDir = join(appDir, "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${installationId}.log`);
  const child = spawn(resolvedStart.command, resolvedStart.args || [], {
    cwd: resolvedStart.cwd || installDir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const log = createWriteStream(logPath, { flags: "a" });
  log.on("error", () => {
    // Log directory can disappear during uninstall/test cleanup; command state is still reported upstream.
  });
  child.stdout.on("data", (chunk) => log.write(maskSecrets(chunk.toString())));
  child.stderr.on("data", (chunk) => log.write(maskSecrets(chunk.toString())));
  child.on("close", () => log.end());
  child.unref();
  const runtime = { pid: child.pid, started_at: new Date().toISOString(), log_path: logPath };
  writeFileSync(join(installDir, "runtime.json"), JSON.stringify(runtime, null, 2));
  return { runtime_status: "RUNNING", pid: child.pid, log_path: logPath };
}

export function stopPlugin({ appDir, installationId }) {
  const runtimePath = join(appDir, "plugins", installationId, "runtime.json");
  if (!existsSync(runtimePath)) return { runtime_status: "STOPPED" };
  const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
  if (runtime.pid) {
    try {
      process.kill(runtime.pid, "SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }
  rmSync(runtimePath, { force: true });
  return { runtime_status: "STOPPED" };
}

export function uninstallPlugin({ appDir, installationId, preserveData = true }) {
  stopPlugin({ appDir, installationId });
  rmSync(join(appDir, "plugins", installationId), { recursive: true, force: true });
  if (!preserveData) rmSync(join(appDir, "plugin-data", installationId), { recursive: true, force: true });
  return { install_status: "UNINSTALLED", runtime_status: "STOPPED" };
}

export function tailPluginLog({ appDir, installationId, bytes = 4000 }) {
  const logPath = join(appDir, "logs", `${installationId}.log`);
  if (!existsSync(logPath)) return "";
  const content = readFileSync(logPath);
  return maskSecrets(content.subarray(Math.max(0, content.length - bytes)).toString("utf8"));
}

export async function handlePluginCommand({ appDir, command }) {
  const payload = command.payload || {};
  const manifest = payload.manifest || payload.config?.manifest || {};
  const installationId = payload.installation_id;
  const preserveData = payload.payload?.preserve_data !== false;
  if (!installationId) throw new Error("Command installation_id missing.");
  const type = payload.operation_type || command.command_type?.replace("plugin.", "");
  if (type === "install" || type === "update") {
    const result = await installPlugin({
      appDir,
      installationId,
      manifest,
      checksum: payload.checksum || manifest.checksum,
      signature: payload.signature || manifest.signature,
      preserveData
    });
    return { install_status: "INSTALLED", runtime_status: "STOPPED", ...result };
  }
  if (type === "start") return startPlugin({ appDir, installationId, manifest, env: payload.env || {} });
  if (type === "stop") return stopPlugin({ appDir, installationId });
  if (type === "restart") {
    stopPlugin({ appDir, installationId });
    return startPlugin({ appDir, installationId, manifest, env: payload.env || {} });
  }
  if (type === "uninstall") return uninstallPlugin({ appDir, installationId, preserveData });
  if (type === "logs") return { runtime_status: "UNKNOWN", log_tail: tailPluginLog({ appDir, installationId }) };
  throw new Error(`Unsupported plugin operation: ${type}`);
}
