import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { handlePluginCommand, maskSecrets, runtimeAvailabilityReport } from "./plugin-runtime.mjs";
import { handleNativeCommand, nativeCapabilityReport } from "./native-runtime.mjs";

const defaultApiBase = "https://backendu.veriussu.com/api/v1";
const appDir = join(homedir(), ".umay", "bridge");
const statePath = join(appDir, "state.json");
const daemonLogPath = join(appDir, "bridge.log");

function readState() {
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(state) {
  mkdirSync(appDir, { recursive: true });
  const tmpPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, statePath);
}

function appendDaemonLog(message) {
  mkdirSync(appDir, { recursive: true });
  appendFileSync(daemonLogPath, `${new Date().toISOString()} ${maskSecrets(message)}\n`);
}

function args() {
  const out = {};
  for (let i = 3; i < process.argv.length; i += 1) {
    const item = process.argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = "true";
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function apiBase(options = args()) {
  return (options["api-base"] || process.env.UMAY_API_BASE || readState()?.api_base || defaultApiBase).replace(/\/$/, "");
}

function accessToken(options = args()) {
  return options["access-token"] || process.env.UMAY_ACCESS_TOKEN || readState()?.auth?.access_token || "";
}

function refreshToken(options = args()) {
  return options["refresh-token"] || process.env.UMAY_REFRESH_TOKEN || readState()?.auth?.refresh_token || "";
}

function persistAuth(options = args(), pair = {}) {
  const state = readState();
  if (!state) return;
  const access = pair.access_token || options["access-token"] || process.env.UMAY_ACCESS_TOKEN || state.auth?.access_token;
  const refresh = pair.refresh_token || options["refresh-token"] || process.env.UMAY_REFRESH_TOKEN || state.auth?.refresh_token;
  if (!access && !refresh) return;
  writeState({
    ...state,
    auth: {
      ...(state.auth || {}),
      ...(access ? { access_token: access } : {}),
      ...(refresh ? { refresh_token: refresh } : {}),
      token_type: pair.token_type || state.auth?.token_type || "bearer",
      expires_in: pair.expires_in || state.auth?.expires_in || null,
      refreshed_at: pair.access_token ? new Date().toISOString() : state.auth?.refreshed_at
    }
  });
}

function deviceProfile(state = readState()) {
  const runtimes = runtimeAvailabilityReport();
  return {
    device_uid: state?.device_uid || randomUUID(),
    device_name: state?.device_name || `${platform()}-${arch()} bridge`,
    public_key: state?.public_key || `bridge-${randomUUID()}`,
    platform: platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : platform(),
    arch: arch() === "x64" ? "x64" : arch(),
    protocol_version: state?.protocol_version || "1.0",
    capabilities: {
      bridge: true,
      plugins: true,
      native: true,
      computer_native: true,
      native_actions: nativeCapabilityReport(),
      platform: platform(),
      arch: arch(),
      runtimes,
      runtime_checked_at: new Date().toISOString()
    }
  };
}

async function request(path, { method = "GET", body, token, options = args() } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBase(options)}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data.message || data.detail || message;
    } catch {
      // ignore non-json error bodies
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function refreshAccessToken(options = args()) {
  const token = refreshToken(options);
  if (!token) throw new Error("Refresh requires --refresh-token, UMAY_REFRESH_TOKEN or stored refresh token.");
  const pair = await request("/auth/refresh", {
    method: "POST",
    body: { refresh_token: token },
    options
  });
  persistAuth(options, pair);
  return pair.access_token;
}

async function authenticatedRequest(path, requestOptions = {}, options = args()) {
  let token = accessToken(options);
  if (!token && refreshToken(options)) {
    token = await refreshAccessToken(options);
  }
  try {
    return await request(path, { ...requestOptions, token, options });
  } catch (error) {
    if (error?.status !== 401 || !refreshToken(options)) {
      throw error;
    }
    token = await refreshAccessToken(options);
    return request(path, { ...requestOptions, token, options });
  }
}

function install() {
  const existing = readState();
  const state = existing || {
    bridge_id: randomUUID(),
    device_uid: randomUUID(),
    device_name: `${platform()}-${arch()} bridge`,
    public_key: `bridge-${randomUUID()}`,
    protocol_version: "1.0",
    platform: platform(),
    arch: arch(),
    installed_at: new Date().toISOString(),
    running: false,
    plugins: []
  };
  writeState({ ...state, installed: true });
  console.log("Umay Bridge installed");
}

export function nodeMajor(version = process.versions.node) {
  return Number(String(version).split(".")[0] || 0);
}

function assertSupportedRuntime() {
  if (nodeMajor() < 22) {
    throw new Error("Umay Bridge requires Node.js 22 or newer.");
  }
}

async function bootstrap() {
  const options = args();
  assertSupportedRuntime();
  install();
  const state = readState() || {};
  writeState({
    ...state,
    api_base: apiBase(options),
    bootstrap_at: new Date().toISOString(),
    bootstrap_version: "0.1.0"
  });
  persistAuth(options);
  if (accessToken(options)) {
    await pair();
  }
  const current = readState();
  if (options.start === "true") {
    if (!current?.device_id) {
      throw new Error("Bootstrap --start requires a paired device. Provide --access-token and --refresh-token first.");
    }
    start();
  } else {
    console.log(JSON.stringify(publicState(readState()), null, 2));
  }
}

async function pair() {
  const options = args();
  const token = accessToken(options);
  if (!token) throw new Error("Pairing requires --access-token or UMAY_ACCESS_TOKEN.");
  const existing = readState();
  const state = existing || {
    bridge_id: randomUUID(),
    installed: true,
    running: false,
    plugins: []
  };
  const profile = deviceProfile(state);
  const created = await request("/devices/pairings", {
    method: "POST",
    token,
    body: {
      device_uid: profile.device_uid,
      device_name: options.name || profile.device_name,
      public_key: profile.public_key,
      platform: profile.platform,
      arch: profile.arch,
      protocol_version: profile.protocol_version,
      capabilities: profile.capabilities
    }
  });
  const confirmed = await request(`/devices/pairings/${created.pairing_id}/confirm`, {
    method: "POST",
    token,
    body: { code: created.code }
  });
  writeState({
    ...state,
    ...profile,
    api_base: apiBase(options),
    auth: {
      access_token: token,
      ...(refreshToken(options) ? { refresh_token: refreshToken(options) } : {}),
      token_type: "bearer",
      paired_at: new Date().toISOString()
    },
    device_id: confirmed.id,
    device_name: confirmed.name,
    paired_at: new Date().toISOString(),
    installed: true
  });
  console.log(JSON.stringify({ paired: true, device_id: confirmed.id, expires_at: created.expires_at }, null, 2));
}

function wsUrl(base, path, token) {
  const url = new URL(base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  url.search = `token=${encodeURIComponent(token)}`;
  return url.toString();
}

export function reconnectDelayMs(attempt, { minMs = 1000, maxMs = 30000, jitterMs = 250 } = {}) {
  const capped = Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));
  return capped + Math.floor(Math.random() * Math.max(0, jitterMs));
}

async function openBridgeSocket(state, options = args()) {
  const bridgeToken = await authenticatedRequest(`/devices/${state.device_id}/bridge-token`, {
    method: "POST"
  }, options);
  return new WebSocket(wsUrl(apiBase(options), bridgeToken.ws_path, bridgeToken.token));
}

async function connectOnce(options = args(), { markStopped = true } = {}) {
  const state = readState();
  if (!state?.installed || !state.device_id) {
    throw new Error("Bridge is not paired. Run npm run pair -- --access-token <token> first.");
  }
  if (!accessToken(options) && !refreshToken(options)) {
    throw new Error("Connect requires --access-token/UMAY_ACCESS_TOKEN or --refresh-token/UMAY_REFRESH_TOKEN.");
  }
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node runtime does not provide WebSocket. Use Node >=22 or add a WebSocket runtime.");
  }

  const ws = await openBridgeSocket(state, options);
  return new Promise((resolve) => {
    const timeoutMs = Number(options.timeout || process.env.UMAY_BRIDGE_TIMEOUT_MS || 0);
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => ws.close(1000, "timeout"), timeoutMs);
    }
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        type: "hello",
        protocol_version: state.protocol_version || "1.0",
        last_sequence: state.last_sequence || 0,
        capabilities: deviceProfile(state).capabilities
      }));
    });
    ws.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data);
      console.log(JSON.stringify(data));
      if (data.type === "commands") {
        for (const command of data.commands || []) {
          const payload = command.payload || {};
          const operationId = payload.operation_id;
          try {
            const result = command.command_type?.startsWith("computer.")
              ? await handleNativeCommand({ command })
              : await handlePluginCommand({ appDir, command });
            writeState({
              ...readState(),
              last_sequence: command.sequence,
              last_command_at: new Date().toISOString()
            });
            if (command.command_type?.startsWith("computer.")) {
              ws.send(JSON.stringify({
                type: "ack",
                command_id: command.command_id,
                status: "completed",
                result
              }));
            } else {
              ws.send(JSON.stringify({
                type: "operation_update",
                body: {
                  operation_id: operationId,
                  installation_id: payload.installation_id,
                  status: "succeeded",
                  step: `${payload.operation_type || command.command_type}.done`,
                  log_message: maskSecrets(`Command ${command.command_id} completed`),
                  event_payload: { command_id: command.command_id },
                  ...result
                }
              }));
              ws.send(JSON.stringify({ type: "ack", command_id: command.command_id, status: "completed" }));
            }
          } catch (error) {
            const message = maskSecrets(error instanceof Error ? error.message : String(error));
            if (!command.command_type?.startsWith("computer.")) {
              ws.send(JSON.stringify({
                type: "operation_update",
                body: {
                  operation_id: operationId,
                  installation_id: payload.installation_id,
                  status: "failed",
                  step: `${payload.operation_type || command.command_type}.failed`,
                  last_error: message,
                  log_level: "error",
                  log_message: message,
                  event_payload: { command_id: command.command_id }
                }
              }));
            }
            ws.send(JSON.stringify({
              type: "ack",
              command_id: command.command_id,
              status: "failed",
              result: { error: message }
            }));
          }
        }
        if (options.once === "true") ws.send(JSON.stringify({ type: "end" }));
      }
      if (data.type === "session_ended" && timer) clearTimeout(timer);
    });
    ws.addEventListener("close", () => {
      if (timer) clearTimeout(timer);
      const current = readState();
      if (current) {
        writeState({
          ...current,
          ...(markStopped ? { running: false, last_stopped_at: new Date().toISOString() } : {}),
          last_disconnected_at: new Date().toISOString()
        });
      }
      resolve();
    });
    ws.addEventListener("error", (event) => {
      console.error("Bridge websocket error", event.message || event.type);
    });
  });
}

async function connect() {
  await connectOnce(args());
}

function start() {
  const options = args();
  const state = readState();
  if (!state?.installed) {
    throw new Error("Bridge is not installed. Run npm run install:bridge first.");
  }
  const nextState = {
    ...state,
    api_base: apiBase(options),
    running: true,
    stop_requested_at: null,
    last_started_at: new Date().toISOString()
  };
  writeState(nextState);
  persistAuth(options);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "daemon"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      UMAY_API_BASE: apiBase(options)
    }
  });
  child.unref();
  writeState({ ...readState(), running: true, daemon_pid: child.pid });
  console.log(`Umay Bridge started pid=${child.pid}`);
}

function stop() {
  const state = readState();
  if (!state) {
    console.log("Umay Bridge is not installed");
    return;
  }
  if (state.daemon_pid) {
    try {
      process.kill(state.daemon_pid, "SIGTERM");
    } catch {
      // daemon may already be stopped
    }
  }
  writeState({ ...state, running: false, stop_requested_at: new Date().toISOString(), last_stopped_at: new Date().toISOString() });
  console.log("Umay Bridge stopped");
}

function publicState(state) {
  if (!state) return { installed: false, running: false };
  const auth = state.auth
    ? {
        ...state.auth,
        access_token: state.auth.access_token ? "***" : undefined,
        refresh_token: state.auth.refresh_token ? "***" : undefined
      }
    : undefined;
  return { ...state, ...(auth ? { auth } : {}) };
}

function status() {
  console.log(JSON.stringify(publicState(readState()), null, 2));
}

function doctor() {
  const state = readState();
  console.log(JSON.stringify({
    ok: nodeMajor() >= 22,
    node_version: process.versions.node,
    platform: platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : platform(),
    arch: arch() === "x64" ? "x64" : arch(),
    app_dir: appDir,
    api_base: apiBase(),
    installed: Boolean(state?.installed),
    paired: Boolean(state?.device_id),
    running: Boolean(state?.running),
    plugin_count: Array.isArray(state?.plugins) ? state.plugins.length : 0,
    runtimes: runtimeAvailabilityReport()
  }, null, 2));
}

function uninstall() {
  const state = readState();
  if (!state) {
    console.log("Umay Bridge is not installed");
    return;
  }
  writeState({ ...state, installed: false, running: false, uninstalled_at: new Date().toISOString() });
  console.log("Umay Bridge uninstalled; plugin data preserved");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function daemon() {
  let attempt = 0;
  process.on("SIGTERM", () => {
    const state = readState();
    if (state) writeState({ ...state, running: false, last_stopped_at: new Date().toISOString() });
    process.exit(0);
  });
  appendDaemonLog("daemon started");
  while (true) {
    const state = readState();
    if (!state?.installed || !state.running) {
      appendDaemonLog("daemon stopped");
      return;
    }
    try {
      await connectOnce(args(), { markStopped: false });
      attempt = 0;
    } catch (error) {
      attempt += 1;
      appendDaemonLog(`daemon connect failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const current = readState();
    if (!current?.installed || !current.running) return;
    await sleep(reconnectDelayMs(attempt));
  }
}

async function main() {
  const command = process.argv[2] || "status";
  if (command === "install") install();
  else if (command === "bootstrap") await bootstrap();
  else if (command === "pair") await pair();
  else if (command === "connect") await connect();
  else if (command === "daemon") await daemon();
  else if (command === "start") start();
  else if (command === "stop") stop();
  else if (command === "status") status();
  else if (command === "doctor") doctor();
  else if (command === "uninstall") uninstall();
  else {
    console.error(`Unknown command: ${command}`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
