import { spawn } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.UMAY_WEB_BASE || "http://127.0.0.1:9056";

const user = {
  id: 1,
  email: "plugin-ui@example.com",
  full_name: "Plugin UI",
  role: "user",
  theme: "dark",
  language: "tr"
};

const device = {
  id: 101,
  device_uid: "ui-device-1",
  name: "Linux UI Device",
  platform: "linux",
  arch: "x64",
  protocol_version: "1.0",
  capabilities: {
    plugins: true,
    runtimes: [
      { package: "opencode", command: "opencode", available: true, reason: null },
      { package: "openhands", command: "openhands", available: false, reason: "openhands_runtime_not_installed" },
      { package: "n8n", command: "n8n", available: false, reason: "n8n_runtime_not_installed" },
      { package: "comfyui", command: "comfyui", available: false, reason: "comfyui_runtime_not_installed" }
    ]
  },
  last_seen_at: "2026-09-23T19:40:00Z",
  revoked_at: null,
  created_at: "2026-09-23T19:30:00Z",
  updated_at: "2026-09-23T19:40:00Z"
};

const catalog = [
  ["opencode", "OpenCode", "programmer", "managed-process", 9057],
  ["openhands", "OpenHands", "programmer", "container-or-managed-process", 9058],
  ["n8n", "n8n Sunucusu", "automation", "managed-process", 9059],
  ["comfyui", "ComfyUI", "media", "managed-process", 9060]
].map(([packageName, name, category, runtime, port], index) => ({
  id: 301 + index,
  plugin_id: `umay.runtime.${packageName}`,
  version: "1.0.0",
  name,
  description: "Uzun açıklama metni ile kart ölçülerini test eden ajan runtime katalog kaydı.",
  category,
  min_bridge_protocol: "1.0",
  platforms: [{ platform: "linux", arch: "*" }],
  manifest: {
    runtime,
    download: { type: "bridge-resolved", package: packageName }
  },
  checksum: null,
  signature: null,
  license_ref: null,
  default_port: port,
  port_required: true,
  is_active: true,
  created_at: "2026-09-23T19:30:00Z",
  updated_at: "2026-09-23T19:40:00Z"
}));

const runningInstallation = {
  id: 501,
  installation_id: "install-running-ui",
  device_id: 101,
  plugin_id: "umay.test.running",
  version: "1.0.0",
  install_status: "INSTALLED",
  runtime_status: "RUNNING",
  bind_address: "127.0.0.1",
  port: 9057,
  installed_path: "/home/user/.umay/bridge/plugins/umay.test.running",
  data_dir: "/home/user/.umay/bridge/plugin-data/umay.test.running",
  config: {},
  last_error: null,
  last_seen_at: "2026-09-23T19:40:00Z",
  created_at: "2026-09-23T19:30:00Z",
  updated_at: "2026-09-23T19:40:00Z"
};

const missingRuntimeInstallation = {
  id: 502,
  installation_id: "install-openhands-missing",
  device_id: 101,
  plugin_id: "umay.runtime.openhands",
  version: "1.0.0",
  install_status: "INSTALLED",
  runtime_status: "STOPPED",
  bind_address: "127.0.0.1",
  port: 9058,
  installed_path: "/home/user/.umay/bridge/plugins/openhands",
  data_dir: "/home/user/.umay/bridge/plugin-data/openhands",
  config: {},
  last_error: null,
  last_seen_at: "2026-09-23T19:40:00Z",
  created_at: "2026-09-23T19:30:00Z",
  updated_at: "2026-09-23T19:40:00Z"
};

function respond(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}

async function serverIsUp() {
  try {
    const res = await fetch(BASE, { method: "HEAD", signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  if (await serverIsUp()) return null;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "9056"], {
    stdio: "ignore",
    detached: false
  });
  for (let i = 0; i < 40; i += 1) {
    if (await serverIsUp()) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill("SIGTERM");
  throw new Error(`Web server did not start at ${BASE}`);
}

function log(step, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? " - " + detail : ""}`);
  return ok;
}

async function modalFitsViewport(page) {
  return page.evaluate(() => {
    const modal = document.querySelector(".pc-modal");
    const main = document.querySelector(".pc-main");
    if (!modal || !main) return { ok: false, detail: "modal missing" };
    const rect = modal.getBoundingClientRect();
    const modalWithinViewport = rect.left >= 0
      && rect.top >= 0
      && rect.right <= window.innerWidth
      && rect.bottom <= window.innerHeight;
    const mainNoHorizontalOverflow = main.scrollWidth <= main.clientWidth + 1;
    const bodyNoHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 1;
    return {
      ok: modalWithinViewport && mainNoHorizontalOverflow && bodyNoHorizontalOverflow,
      detail: `modal=${Math.round(rect.width)}x${Math.round(rect.height)} viewport=${window.innerWidth}x${window.innerHeight} main=${main.clientWidth}/${main.scrollWidth} body=${document.documentElement.clientWidth}/${document.documentElement.scrollWidth}`
    };
  });
}

async function modalHasNoVerticalOverlap(page) {
  return page.evaluate(() => {
    const columns = document.querySelector(".pc-columns");
    const detail = document.querySelector(".pc-detail");
    const logPanel = document.querySelector(".pc-log-panel");
    if (!columns || !logPanel) return { ok: false, detail: "layout sections missing" };
    const columnsRect = columns.getBoundingClientRect();
    const detailRect = detail?.getBoundingClientRect();
    const logRect = logPanel.getBoundingClientRect();
    const detailAfterColumns = !detailRect || detailRect.top >= columnsRect.bottom - 1;
    const logAfterPrevious = logRect.top >= (detailRect?.bottom || columnsRect.bottom) - 1;
    return {
      ok: detailAfterColumns && logAfterPrevious,
      detail: `columnsBottom=${Math.round(columnsRect.bottom)} detailTop=${detailRect ? Math.round(detailRect.top) : "none"} logTop=${Math.round(logRect.top)}`
    };
  });
}

const server = await startServerIfNeeded();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const operations = [];
const layoutChecks = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    if (path === "/system-settings/public") return respond(route, {});
    if (path === "/auth/me") return respond(route, user);
    if (path === "/conversations") return respond(route, []);
    if (path === "/providers/admin/active-models") return respond(route, []);
    if (path === "/admin/data-agent/entries") return respond(route, { items: [], total: 0, skip: 0, limit: 80 });
    if (path === "/devices") return respond(route, [device]);
    if (path === "/plugins/catalog") return respond(route, catalog);
    if (path === "/plugins/installations") return respond(route, [runningInstallation, missingRuntimeInstallation]);
    if (path === "/plugins/installations/install-running-ui/logs") return respond(route, []);
    if (path === "/plugins/installations/install-openhands-missing/logs") return respond(route, []);
    if (path === "/plugins/installations/install-running-ui/operations" || path === "/plugins/installations/install-openhands-missing/operations") {
      const body = route.request().postDataJSON();
      operations.push(body.operation_type);
      return respond(route, {
        operation_id: `op-${body.operation_type}`,
        command_id: `cmd-${body.operation_type}`,
        installation_id: "install-running-ui",
        status: "queued"
      }, 202);
    }
    return respond(route, {});
  });
  await page.route("**/api.open-meteo.com/**", (route) => respond(route, {}));

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.evaluate(() => {
    localStorage.setItem("umay_web_access", "ui-access");
    localStorage.setItem("umay_web_refresh", "ui-refresh");
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.getByRole("button", { name: /Eklentiler/i }).click();
  await page.getByRole("dialog", { name: /Eklentiler ve Cihazlar/i }).waitFor({ state: "visible", timeout: 8000 });
  let fit = await modalFitsViewport(page);
  layoutChecks.push(fit.ok);
  log("Modal desktop taşma yok", fit.ok, fit.detail);
  let stack = await modalHasNoVerticalOverlap(page);
  layoutChecks.push(stack.ok);
  log("Modal desktop üst üste binme yok", stack.ok, stack.detail);

  const runningCard = page.locator(".pc-install", { hasText: "umay.test.running" });
  await runningCard.waitFor({ state: "visible", timeout: 8000 });
  const uninstall = runningCard.getByTitle("Önce eklentiyi durdurun");
  const uninstallDisabled = await uninstall.isDisabled();
  log("RUNNING kurulumda Kaldır disabled", uninstallDisabled);

  await runningCard.getByTitle("Yeniden başlat").click();
  await page.waitForTimeout(300);
  log("Restart komutu queue'ya gider", operations.includes("restart"), operations.join(","));
  log("Uninstall komutu gönderilmedi", !operations.includes("uninstall"), operations.join(","));

  const missingRuntimeCard = page.locator(".pc-install", { hasText: "OpenHands" });
  await missingRuntimeCard.waitFor({ state: "visible", timeout: 8000 });
  const blockedStart = missingRuntimeCard.getByTitle(/Runtime eksik:/).first();
  const startDisabled = await blockedStart.isDisabled();
  log("Runtime eksikken Başlat disabled", startDisabled);
  log("Runtime eksikken start queue'ya gitmedi", !operations.includes("start"), operations.join(","));

  await page.setViewportSize({ width: 900, height: 760 });
  await page.waitForTimeout(250);
  fit = await modalFitsViewport(page);
  layoutChecks.push(fit.ok);
  log("Modal orta genişlik taşma yok", fit.ok, fit.detail);
  stack = await modalHasNoVerticalOverlap(page);
  layoutChecks.push(stack.ok);
  log("Modal orta genişlik üst üste binme yok", stack.ok, stack.detail);

  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(250);
  fit = await modalFitsViewport(page);
  layoutChecks.push(fit.ok);
  log("Modal mobil taşma yok", fit.ok, fit.detail);
  stack = await modalHasNoVerticalOverlap(page);
  layoutChecks.push(stack.ok);
  log("Modal mobil üst üste binme yok", stack.ok, stack.detail);

  const realErrors = errors.filter((error) => !/favicon|401|403|429|502/.test(error));
  log("Konsol hatası yok", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
  const failed = [
    layoutChecks.some((ok) => !ok),
    !uninstallDisabled,
    !operations.includes("restart"),
    !startDisabled,
    operations.includes("start"),
    operations.includes("uninstall"),
    realErrors.length > 0
  ].some(Boolean);
  process.exitCode = failed ? 1 : 0;
} finally {
  await browser.close();
  if (server) server.kill("SIGTERM");
}
