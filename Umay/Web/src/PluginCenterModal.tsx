import { useEffect, useMemo, useState } from "react";
import {
  Download,
  HardDrive,
  Loader2,
  Play,
  Plug,
  Power,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Trash2,
  X
} from "lucide-react";
import { client } from "./lib/api";
import type { AgentDevice, DevicePairing, PluginCatalogItem, PluginInstallation, PluginLog, PluginOperationResult, RuntimeAvailability } from "./types";

const FEATURED_PLUGIN_IDS = [
  "umay.runtime.opencode",
  "umay.runtime.openhands",
  "umay.runtime.n8n",
  "umay.runtime.comfyui"
];

const CATEGORY_LABELS: Record<string, string> = {
  programmer: "Kodlama",
  automation: "Otomasyon",
  media: "Görsel / Video",
  general: "Genel"
};

function localDeviceProfile() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const rawPlatform = (nav.userAgentData?.platform || navigator.platform || "web").toLowerCase();
  const platform = rawPlatform.includes("mac")
    ? "macos"
    : rawPlatform.includes("win")
      ? "windows"
      : rawPlatform.includes("linux")
        ? "linux"
        : "web";
  const arch = rawPlatform.includes("arm") ? "arm64" : "x64";
  const device_uid = localStorage.getItem("umay_bridge_device_uid") || crypto.randomUUID();
  localStorage.setItem("umay_bridge_device_uid", device_uid);
  return {
    device_uid,
    device_name: `${platform.toUpperCase()} Web Cihazı`,
    public_key: `web-${device_uid}`,
    platform,
    arch,
    protocol_version: "1.0",
    capabilities: {
      frontend: true,
      plugins: true,
      cores: navigator.hardwareConcurrency || null
    }
  };
}

function fmt(value: string | null) {
  if (!value) return "Yok";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusText(item: PluginInstallation | undefined) {
  if (!item) return "Kurulmadı";
  return `${item.install_status} / ${item.runtime_status}`;
}

function isRunning(item: PluginInstallation) {
  return item.runtime_status === "RUNNING";
}

function pluginRank(item: PluginCatalogItem) {
  const index = FEATURED_PLUGIN_IDS.indexOf(item.plugin_id);
  return index >= 0 ? index : FEATURED_PLUGIN_IDS.length + 1;
}

function pluginMeta(item: PluginCatalogItem) {
  const runtime = typeof item.manifest.runtime === "string" ? item.manifest.runtime : "managed-process";
  const download = item.manifest.download && typeof item.manifest.download === "object"
    ? item.manifest.download as Record<string, unknown>
    : {};
  const packageName = typeof download.package === "string" ? download.package : item.plugin_id;
  return { runtime, packageName };
}

function runtimeHealth(device: AgentDevice | null, packageName: string): RuntimeAvailability | null {
  const runtimes = device?.capabilities?.runtimes;
  if (!Array.isArray(runtimes)) return null;
  return (runtimes as RuntimeAvailability[]).find((item) => item.package === packageName || item.command === packageName) || null;
}

function runtimeSummary(device: AgentDevice | null) {
  const runtimes = device?.capabilities?.runtimes;
  if (!Array.isArray(runtimes) || runtimes.length === 0) return "Runtime raporu yok";
  const ready = (runtimes as RuntimeAvailability[]).filter((item) => item.available).length;
  return `${ready}/${runtimes.length} runtime hazır`;
}

function runtimeBadgeText(health: RuntimeAvailability | null) {
  if (!health) return "runtime bilinmiyor";
  return health.available ? "runtime hazır" : "runtime eksik";
}

function installationRuntimeHealth(
  catalogById: Map<string, PluginCatalogItem>,
  device: AgentDevice | null,
  item: PluginInstallation
) {
  const catalogItem = catalogById.get(item.plugin_id);
  if (!catalogItem) return null;
  return runtimeHealth(device, pluginMeta(catalogItem).packageName);
}

function startBlockedReason(health: RuntimeAvailability | null) {
  if (!health || health.available) return "";
  return health.reason || "runtime_not_installed";
}

export function PluginCenterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [devices, setDevices] = useState<AgentDevice[]>([]);
  const [catalog, setCatalog] = useState<PluginCatalogItem[]>([]);
  const [installations, setInstallations] = useState<PluginInstallation[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
  const [logs, setLogs] = useState<PluginLog[]>([]);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");
  const [pairing, setPairing] = useState<DevicePairing | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastOperation, setLastOperation] = useState<PluginOperationResult | null>(null);
  const [category, setCategory] = useState("all");

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) || devices[0] || null,
    [devices, selectedDeviceId]
  );

  const selectedInstallations = useMemo(
    () => installations.filter((item) => !selectedDevice || item.device_id === selectedDevice.id),
    [installations, selectedDevice]
  );

  const selectedInstallation = useMemo(
    () => selectedInstallations.find((item) => item.installation_id === selectedInstallationId) || selectedInstallations[0] || null,
    [selectedInstallations, selectedInstallationId]
  );

  const catalogById = useMemo(
    () => new Map(catalog.map((item) => [item.plugin_id, item])),
    [catalog]
  );

  const visibleCatalog = useMemo(
    () => catalog
      .filter((item) => category === "all" || item.category === category)
      .sort((a, b) => pluginRank(a) - pluginRank(b) || a.name.localeCompare(b.name, "tr")),
    [catalog, category]
  );

  const categories = useMemo(
    () => Array.from(new Set(catalog.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "tr")),
    [catalog]
  );

  async function load({ silent = false } = {}) {
    if (!silent) setError("");
    const [deviceRows, catalogRows, installationRows] = await Promise.all([
      client.devices(),
      client.pluginCatalog(),
      client.pluginInstallations()
    ]);
    setDevices(deviceRows);
    setCatalog(catalogRows);
    setInstallations(installationRows);
    setLastRefreshedAt(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    if (!selectedDeviceId && deviceRows[0]) setSelectedDeviceId(deviceRows[0].id);
  }

  async function loadLogs(installationId: string, { silent = false } = {}) {
    if (!silent) setError("");
    const rows = await client.pluginLogs(installationId, 80);
    setLogs(rows);
  }

  useEffect(() => {
    if (!open) return;
    void load().catch((err) => setError(err instanceof Error ? err.message : "Eklentiler alınamadı."));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => {
      void load({ silent: true }).catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [open, selectedDeviceId]);

  useEffect(() => {
    if (!open) return;
    if (!selectedInstallation) {
      setSelectedInstallationId(null);
      setLogs([]);
      return;
    }
    if (selectedInstallation.installation_id !== selectedInstallationId) {
      setSelectedInstallationId(selectedInstallation.installation_id);
    }
    void loadLogs(selectedInstallation.installation_id, { silent: true }).catch(() => undefined);
  }, [open, selectedInstallation?.installation_id]);

  useEffect(() => {
    if (!open || !selectedInstallation) return;
    const timer = window.setInterval(() => {
      void loadLogs(selectedInstallation.installation_id, { silent: true }).catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [open, selectedInstallation?.installation_id]);

  if (!open) return null;

  async function pairThisDevice() {
    setBusy("pair");
    setError("");
    try {
      const created = await client.createDevicePairing(localDeviceProfile());
      setPairing(created);
      const confirmed = await client.confirmDevicePairing(created.pairing_id, created.code);
      setSelectedDeviceId(confirmed.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cihaz eşleştirilemedi.");
    } finally {
      setBusy("");
    }
  }

  async function heartbeat(deviceId: number) {
    setBusy(`heartbeat:${deviceId}`);
    setError("");
    try {
      await client.heartbeatDevice(deviceId, { frontend: true, heartbeat: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cihaz güncellenemedi.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(deviceId: number) {
    setBusy(`revoke:${deviceId}`);
    setError("");
    try {
      await client.revokeDevice(deviceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cihaz kaldırılamadı.");
    } finally {
      setBusy("");
    }
  }

  async function installPlugin(item: PluginCatalogItem) {
    if (!selectedDevice) {
      setError("Önce cihaz eşleştir.");
      return;
    }
    setBusy(`install:${item.plugin_id}`);
    setError("");
    try {
      await client.createPluginInstallation({
        device_id: selectedDevice.id,
        plugin_id: item.plugin_id,
        version: item.version
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eklenti kaydedilemedi.");
    } finally {
      setBusy("");
    }
  }

  async function operation(item: PluginInstallation, operationType: "install" | "uninstall" | "start" | "stop" | "restart" | "logs" | "update") {
    if (operationType === "uninstall" && isRunning(item)) {
      setError("Çalışan eklenti kaldırılamaz; önce durdurun.");
      setSelectedInstallationId(item.installation_id);
      return;
    }
    setBusy(`${operationType}:${item.installation_id}`);
    setError("");
    setSelectedInstallationId(item.installation_id);
    try {
      if (operationType === "logs") {
        await loadLogs(item.installation_id);
        return;
      }
      const result = await client.queuePluginOperation(item.installation_id, operationType, { preserve_data: operationType === "uninstall" });
      setLastOperation(result);
      await load();
      await loadLogs(item.installation_id, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Komut kuyruğa alınamadı.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="pc-backdrop">
      <section className="pc-modal" role="dialog" aria-modal="true" aria-label="Eklentiler ve Cihazlar">
        <header className="pc-head">
          <div className="pc-head-title">
            <span className="pc-logo"><Plug size={17} /></span>
            <div>
              <h2>EKLENTİLER</h2>
              <small>Cihazlar ve yerel servisler</small>
            </div>
          </div>
          <button type="button" className="us-close" onClick={onClose} aria-label="Kapat"><X size={17} /></button>
        </header>

        <div className="pc-body">
          <aside className="pc-side hidden-scroll">
            <button type="button" className="pc-primary" onClick={pairThisDevice} disabled={busy === "pair"}>
              {busy === "pair" ? <Loader2 size={16} className="spin" /> : <Plug size={16} />}
              <span>Bu Cihazı Eşleştir</span>
            </button>
            {pairing && (
              <div className="pc-code">
                <span>Son kod</span>
                <strong>{pairing.code}</strong>
                <small>{fmt(pairing.expires_at)}</small>
              </div>
            )}

            <div className="pc-section-title">Cihazlar</div>
            {devices.length === 0 ? (
              <div className="pc-empty">Eşlenmiş cihaz yok.</div>
            ) : devices.map((device) => (
              <button
                type="button"
                key={device.id}
                className={`pc-device ${selectedDevice?.id === device.id ? "active" : ""}`}
                onClick={() => setSelectedDeviceId(device.id)}
              >
                <HardDrive size={16} />
                <span>
                  <strong>{device.name}</strong>
                  <small>{device.platform} / {device.arch}</small>
                </span>
                <i className={device.revoked_at ? "down" : "up"} />
              </button>
            ))}
          </aside>

          <main className="pc-main hidden-scroll">
            {error && <div className="pc-error">{error}</div>}
            {lastOperation && (
              <div className="pc-operation">
                <span>Son komut</span>
                <strong>{lastOperation.status}</strong>
                <small>{lastOperation.command_id}</small>
              </div>
            )}

            {selectedDevice && (
              <section className="pc-device-card">
                <div>
                  <h3>{selectedDevice.name}</h3>
                  <p>{selectedDevice.platform} / {selectedDevice.arch} · Protokol {selectedDevice.protocol_version}</p>
                  <small>Son bağlantı: {fmt(selectedDevice.last_seen_at)} · {runtimeSummary(selectedDevice)}</small>
                </div>
                <div className="pc-actions">
                  <button type="button" title="Heartbeat" onClick={() => heartbeat(selectedDevice.id)} disabled={busy === `heartbeat:${selectedDevice.id}`}>
                    {busy === `heartbeat:${selectedDevice.id}` ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                  </button>
                  <button type="button" title="Revoke" onClick={() => revoke(selectedDevice.id)} disabled={busy === `revoke:${selectedDevice.id}`}>
                    <Power size={15} />
                  </button>
                </div>
              </section>
            )}

            <div className="pc-columns">
              <section>
                <div className="pc-section-line">
                  <div className="pc-section-title">Ajan Runtime Kataloğu</div>
                  <small>{lastRefreshedAt ? `Yenilendi ${lastRefreshedAt}` : "Hazırlanıyor"}</small>
                </div>
                <div className="pc-filter" role="tablist" aria-label="Eklenti kategorileri">
                  <button type="button" className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>Tümü</button>
                  {categories.map((item) => (
                    <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>
                      {CATEGORY_LABELS[item] || item}
                    </button>
                  ))}
                </div>
                <div className="pc-list">
                  {visibleCatalog.map((item) => {
                    const installed = installations.find((row) => row.plugin_id === item.plugin_id && row.device_id === selectedDevice?.id);
                    const meta = pluginMeta(item);
                    const health = runtimeHealth(selectedDevice, meta.packageName);
                    return (
                      <article className="pc-card" key={`${item.plugin_id}:${item.version}`}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.plugin_id} · {item.version}</small>
                          <p>{item.description || item.category}</p>
                          <div className="pc-tags">
                            <span>{CATEGORY_LABELS[item.category] || item.category}</span>
                            <span>{meta.runtime}</span>
                            <span>{item.port_required ? `port ${item.default_port || "9057+"}` : "portsuz"}</span>
                            <span
                              className={health?.available ? "ok" : health ? "warn" : ""}
                              title={health?.reason || runtimeBadgeText(health)}
                            >
                              {runtimeBadgeText(health)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          title={installed ? "Bu cihazda kayıtlı" : "Kurulum kaydı oluştur"}
                          onClick={() => installPlugin(item)}
                          disabled={Boolean(installed) || busy === `install:${item.plugin_id}`}
                        >
                          {busy === `install:${item.plugin_id}` ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                        </button>
                      </article>
                    );
                  })}
                  {visibleCatalog.length === 0 && <div className="pc-empty">Katalog boş.</div>}
                </div>
              </section>

              <section>
                <div className="pc-section-title">Kurulumlar</div>
                <div className="pc-list">
                  {selectedInstallations.map((item) => {
                    const health = installationRuntimeHealth(catalogById, selectedDevice, item);
                    const startReason = startBlockedReason(health);
                    return (
                        <article
                          className={`pc-card pc-install ${selectedInstallation?.installation_id === item.installation_id ? "active" : ""}`}
                          key={item.installation_id}
                          onClick={() => setSelectedInstallationId(item.installation_id)}
                        >
                          <div>
                            <strong>{catalogById.get(item.plugin_id)?.name || item.plugin_id}</strong>
                            <small>{statusText(item)} · {item.bind_address}{item.port ? `:${item.port}` : ""}</small>
                            <p>{item.last_error || (startReason ? `Runtime eksik: ${startReason}` : "Komut bekliyor.")}</p>
                            <div className="pc-tags">
                              <span>{item.install_status}</span>
                              <span>{item.runtime_status}</span>
                              <span>{item.port ? `:${item.port}` : "port yok"}</span>
                              {health && (
                                <span className={health.available ? "ok" : "warn"} title={health.reason || runtimeBadgeText(health)}>
                                  {runtimeBadgeText(health)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="pc-actions">
                            {busy.endsWith(`:${item.installation_id}`) ? (
                              <button type="button" title="Komut işleniyor" disabled><Loader2 size={14} className="spin" /></button>
                            ) : (
                              <>
                                <button type="button" title="Kur" onClick={() => operation(item, "install")}><Download size={14} /></button>
                                <button
                                  type="button"
                                  title={startReason ? `Runtime eksik: ${startReason}` : "Başlat"}
                                  disabled={Boolean(startReason)}
                                  onClick={() => operation(item, "start")}
                                >
                                  <Play size={14} />
                                </button>
                                <button type="button" title="Durdur" onClick={() => operation(item, "stop")}><Power size={14} /></button>
                                <button
                                  type="button"
                                  title={startReason ? `Runtime eksik: ${startReason}` : "Yeniden başlat"}
                                  disabled={Boolean(startReason)}
                                  onClick={() => operation(item, "restart")}
                                >
                                  <RotateCcw size={14} />
                                </button>
                                <button type="button" title="Güncelle" onClick={() => operation(item, "update")}><RefreshCw size={14} /></button>
                                <button type="button" title="Log" onClick={() => operation(item, "logs")}><ScrollText size={14} /></button>
                                <button
                                  type="button"
                                  title={isRunning(item) ? "Önce eklentiyi durdurun" : "Kaldır"}
                                  aria-disabled={isRunning(item)}
                                  disabled={isRunning(item)}
                                  onClick={() => operation(item, "uninstall")}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                    );
                  })}
                  {selectedInstallations.length === 0 && <div className="pc-empty">Bu cihazda kurulum yok.</div>}
                </div>
              </section>
            </div>

            {selectedInstallation && (
              <section className="pc-detail">
                <div>
                  <span>Seçili kurulum</span>
                  <strong>{catalogById.get(selectedInstallation.plugin_id)?.name || selectedInstallation.plugin_id}</strong>
                  <small>{selectedInstallation.installation_id}</small>
                </div>
                <div>
                  <span>Yollar</span>
                  <strong>{selectedInstallation.installed_path || "Henüz kurulmadı"}</strong>
                  <small>{selectedInstallation.data_dir || "Veri dizini oluşmadı"}</small>
                </div>
              </section>
            )}

            <section className="pc-log-panel">
              <div className="pc-section-line">
                <div className="pc-section-title">Loglar</div>
                <button
                  type="button"
                  className="pc-inline"
                  disabled={!selectedInstallation || busy === `logs:${selectedInstallation.installation_id}`}
                  onClick={() => selectedInstallation && operation(selectedInstallation, "logs")}
                >
                  {selectedInstallation && busy === `logs:${selectedInstallation.installation_id}` ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                  <span>Yenile</span>
                </button>
              </div>
              <div className="pc-log-list hidden-scroll">
                {logs.map((row) => (
                  <div className={`pc-log-row ${row.level}`} key={row.id}>
                    <time>{fmt(row.created_at)}</time>
                    <span>{row.level}</span>
                    <p>{row.message}</p>
                  </div>
                ))}
                {logs.length === 0 && <div className="pc-empty">Log kaydı yok.</div>}
              </div>
            </section>
          </main>
        </div>
      </section>
    </div>
  );
}
