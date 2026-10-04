import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../src/index.mjs", import.meta.url));

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function runBridge(args, { home, apiBase }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      env: {
        ...process.env,
        HOME: home,
        UMAY_API_BASE: apiBase
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`bridge exited ${code}: ${stderr || stdout}`));
    });
  });
}

function parseLastJson(stdout) {
  const start = stdout.lastIndexOf("\n{");
  const raw = start >= 0 ? stdout.slice(start + 1) : stdout;
  return JSON.parse(raw);
}

test("bootstrap pairs a clean device, masks tokens, and controls daemon", async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const body = await readJsonBody(req);
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (req.method === "POST" && req.url === "/api/v1/devices/pairings") {
        assert.equal(req.headers.authorization, "Bearer access-token-secret");
        assert.equal(body.platform, "linux");
        assert.equal(body.protocol_version, "1.0");
        assert.equal(Array.isArray(body.capabilities.runtimes), true);
        assert.equal(body.capabilities.runtimes.some((runtime) => runtime.package === "opencode"), true);
        assert.equal(body.capabilities.native_actions.platform, "linux");
        assert.equal(body.capabilities.native_actions.actions.terminal_run.available, true);
        assert.equal(body.capabilities.native_actions.actions.file_write.available, true);
        sendJson(res, 201, {
          pairing_id: "pairing-1",
          code: "123456",
          expires_at: "2026-09-23T20:00:00Z"
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/v1/devices/pairings/pairing-1/confirm") {
        assert.equal(req.headers.authorization, "Bearer access-token-secret");
        assert.equal(body.code, "123456");
        sendJson(res, 200, {
          id: "device-1",
          name: "Clean CLI Device"
        });
        return;
      }
      if (req.method === "POST" && req.url === "/api/v1/devices/device-1/bridge-token") {
        assert.equal(req.headers.authorization, "Bearer access-token-secret");
        sendJson(res, 200, {
          token: "bridge-token-secret",
          ws_path: "/api/v1/devices/bridge/ws",
          expires_in: 60
        });
        return;
      }
      sendJson(res, 404, { detail: "not found" });
    } catch (error) {
      sendJson(res, 500, { detail: error instanceof Error ? error.message : String(error) });
    }
  });
  const address = await listen(server);
  const apiBase = `http://${address.address}:${address.port}/api/v1`;
  const home = mkdtempSync(join(tmpdir(), "umay-bridge-cli-"));

  try {
    const boot = await runBridge([
      "bootstrap",
      "--api-base",
      apiBase,
      "--access-token",
      "access-token-secret",
      "--refresh-token",
      "refresh-token-secret"
    ], { home, apiBase });
    const bootBody = parseLastJson(boot.stdout);
    assert.equal(bootBody.device_id, "device-1");
    assert.ok(bootBody.paired_at);
    assert.equal(bootBody.auth.access_token, "***");
    assert.equal(bootBody.auth.refresh_token, "***");

    const status = await runBridge(["status"], { home, apiBase });
    assert.ok(!status.stdout.includes("access-token-secret"));
    assert.ok(!status.stdout.includes("refresh-token-secret"));
    const state = JSON.parse(status.stdout);
    assert.equal(state.device_id, "device-1");
    assert.equal(state.auth.access_token, "***");
    assert.equal(state.auth.refresh_token, "***");
    assert.equal(state.api_base, apiBase);

    await runBridge(["start"], { home, apiBase });
    const runningStatus = await runBridge(["status"], { home, apiBase });
    const runningState = JSON.parse(runningStatus.stdout);
    assert.equal(runningState.running, true);
    assert.ok(runningState.daemon_pid);

    await runBridge(["stop"], { home, apiBase });
    const stoppedStatus = await runBridge(["status"], { home, apiBase });
    const stoppedState = JSON.parse(stoppedStatus.stdout);
    assert.equal(stoppedState.running, false);
    assert.equal(requests.length >= 2, true);
  } finally {
    await close(server);
  }
});

test("doctor reports bridge runtime availability without leaking tokens", async () => {
  const home = mkdtempSync(join(tmpdir(), "umay-bridge-doctor-"));
  const apiBase = "http://127.0.0.1:9050/api/v1";

  const installed = await runBridge(["install"], { home, apiBase });
  assert.equal(installed.stdout.includes("installed"), true);

  const doctor = await runBridge(["doctor"], { home, apiBase });
  const body = parseLastJson(doctor.stdout);
  assert.equal(body.installed, true);
  assert.equal(Array.isArray(body.runtimes), true);
  assert.equal(body.runtimes.some((runtime) => runtime.package === "opencode"), true);
  assert.equal(body.runtimes.some((runtime) => runtime.package === "n8n"), true);
  assert.ok(!doctor.stdout.includes("access-token-secret"));
  assert.ok(!doctor.stdout.includes("refresh-token-secret"));
});
