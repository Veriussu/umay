import type { ActiveModel, AgentDevice, ChatResponse, Conversation, DataEntriesResponse, DevicePairing, MemoryRecord, Message, PluginCatalogItem, PluginInstallation, PluginLog, PluginOperationResult, ProviderCatalogEntry, Reminder, User, UserProviderConfig } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://backendu.veriussu.com/api/v1").replace(/\/$/, "");
const ACCESS_KEY = "umay_web_access";
const REFRESH_KEY = "umay_web_refresh";

/* --- Gerçek zamanlı izleme: her API çağrısı sayılır ve dinleyicilere bildirilir --- */
type Listener = () => void;

export const rt = {
  calls: 0,
  lastPath: "",
  lastAt: "",
  latency: 0,
  listeners: new Set<Listener>(),
  hit(path: string, ms: number) {
    this.calls += 1;
    this.lastPath = path;
    this.lastAt = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    this.latency = ms;
    this.listeners.forEach((fn) => fn());
  },
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh })
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export async function api<T>(path: string, options: RequestInit = {}, authed = true): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined)
  };
  const token = getAccessToken();
  if (authed && token) headers.Authorization = `Bearer ${token}`;

  const startedAt = performance.now();
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && authed && await tryRefresh()) {
    return api<T>(path, options, authed);
  }
  const elapsed = Math.round(performance.now() - startedAt);
  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    try {
      const body = await res.json();
      message = body.message || body.detail || message;
    } catch {
      /* boş gövde */
    }
    throw new ApiError(res.status, String(message));
  }
  rt.hit(path, elapsed);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export { API_BASE as API_BASE_URL };

/* --- Akışlı gönderim (SSE) ---------------------------------------------
   Backend `POST /messages/stream` uçunu `text/event-stream` ile açar ve
   olayları şu sırayla yollar:
     durum — aşama ilerlemesi
     arac  — hangi kaynaklara gidildi
     metin — cevabın bir parçası (GEÇİCİ; `bitti` üzerine yazar)
     bitti — son ve doğru cevap (ChatResponse)
     hata  — akış başlamadan hata

   EventSource kullanılmıyor: POST gövdesi + Authorization başlığı
   gerekiyor, EventSource yalnız GET'te ve tarayıcıdan auth gönderemiyor.
   Bunun yerine `fetch` + `ReadableStream` ile ayrıştırılır.
   ------------------------------------------------------------------- */

export type StreamEvent =
  | { tur: "durum"; ad: string; metin: string }
  | { tur: "arac"; adlar: string[] }
  | { tur: "metin"; metin: string }
  | { tur: "bitti"; veri: ChatResponse }
  | { tur: "hata"; mesaj: string };

export interface StreamHandlers {
  onDurum?: (ad: string, metin: string) => void;
  onArac?: (adlar: string[]) => void;
  onMetin?: (parca: string) => void;
}

/** SSE gövdesinden bir olay ayrıştırır. `data:` JSON çözülemezse null. */
function parseSseEvent(block: string): StreamEvent | null {
  let event = "";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!event) return null;
  let payload: Record<string, unknown> = {};
  if (data.length) {
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return null;
    }
  }
  switch (event) {
    case "durum":
      return { tur: "durum", ad: String(payload.ad || ""), metin: String(payload.metin || "") };
    case "arac":
      return { tur: "arac", adlar: Array.isArray(payload.adlar) ? payload.adlar.map(String) : [] };
    case "metin":
      return { tur: "metin", metin: String(payload.metin || "") };
    case "bitti":
      return { tur: "bitti", veri: payload as unknown as ChatResponse };
    case "hata":
      return { tur: "hata", mesaj: String(payload.mesaj || "Bilinmeyen hata") };
    default:
      return null;
  }
}

export async function sendMessageStream(
  conversationId: number,
  content: string,
  use_search: boolean,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<ChatResponse> {
  const path = `/conversations/${conversationId}/messages/stream`;
  const startedAt = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {})
    },
    body: JSON.stringify({ content, use_search }),
    signal
  });

  if (res.status === 401 && (await tryRefresh())) {
    return sendMessageStream(conversationId, content, use_search, handlers, signal);
  }
  if (!res.ok) {
    let message = `İstek başarısız (${res.status})`;
    try {
      const body = await res.json();
      message = body.message || body.detail || message;
    } catch {
      /* boş gövde */
    }
    throw new ApiError(res.status, String(message));
  }
  if (!res.body) {
    // Akış desteklemeyen ortam: düz uca düş (aynı iş, ara adımlar görünmez).
    const data = (await res.json()) as ChatResponse;
    handlers.onMetin?.(data.message?.content || "");
    return data;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalData: ChatResponse | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE olayları boş satırla ayrılır.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseEvent(block);
        if (!event) continue;
        if (event.tur === "durum") handlers.onDurum?.(event.ad, event.metin);
        else if (event.tur === "arac") handlers.onArac?.(event.adlar);
        else if (event.tur === "metin") handlers.onMetin?.(event.metin);
        else if (event.tur === "bitti") finalData = event.veri;
        else if (event.tur === "hata") throw new ApiError(res.status, event.mesaj);
      }
    }
  } finally {
    reader.releaseLock();
  }
  rt.hit(path, Math.round(performance.now() - startedAt));
  if (!finalData) throw new ApiError(502, "Akış yarıda kesildi.");
  return finalData;
}

export async function login(email: string, password: string) {
  const data = await api<{ access_token: string; refresh_token: string }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false
  );
  setTokens(data.access_token, data.refresh_token);
}

export async function register(full_name: string, email: string, password: string) {
  await api<User>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ full_name, email, password, theme: "dark", language: "tr" }) },
    false
  );
  await login(email, password);
}

export async function logout() {
  const refresh = getRefreshToken();
  if (refresh) {
    try {
      await api<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) }, false);
    } catch {
      /* oturum zaten geçersiz olabilir */
    }
  }
  clearTokens();
}

export const client = {
  me: () => api<User>("/auth/me"),
  conversations: () => api<Conversation[]>("/conversations?limit=100"),
  createConversation: (title?: string) =>
    api<Conversation>("/conversations", { method: "POST", body: JSON.stringify({ title: title || "Yeni sohbet" }) }),
  messages: (conversationId: number) => api<Message[]>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, content: string, use_search: boolean) =>
    api<ChatResponse>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, use_search })
    }),
  deleteConversation: (conversationId: number) =>
    api<void>(`/conversations/${conversationId}`, { method: "DELETE" }),
  renameConversation: (conversationId: number, title: string) =>
    api<Conversation>(`/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  activeModels: () => api<ActiveModel[]>("/providers/admin/active-models?limit=120"),
  providerCatalog: () => api<ProviderCatalogEntry[]>("/providers/catalog?limit=1000"),
  rssEntries: () => api<DataEntriesResponse>("/admin/data-agent/entries?limit=80"),
  reminders: () => api<Reminder[]>("/reminders?status=pending"),
  updateMe: (data: { full_name?: string; theme?: string; language?: string }) =>
    api<User>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) =>
    api<void>("/users/me/password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  myProviders: () => api<UserProviderConfig[]>("/providers/me"),
  saveMyProvider: (data: { name: string; server_url: string; api_key: string; model_id: string }) =>
    api<UserProviderConfig>("/providers/me", { method: "POST", body: JSON.stringify(data) }),
  updateMyProvider: (configId: number, data: { name?: string; server_url?: string; api_key?: string; model_id?: string; is_active?: boolean }) =>
    api<UserProviderConfig>(`/providers/me/${configId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteMyProvider: (configId: number) =>
    api<void>(`/providers/me/${configId}`, { method: "DELETE" }),
  /* --- Kullanıcının KENDİ modelleri (çok-model + rol/ajan + aktif/pasif) --- */
  syncMyProviderModels: (configId: number) =>
    api<UserProviderConfig>(`/providers/me/${configId}/sync-models`, { method: "POST" }),
  addMyActiveModel: (configId: number, body: { model_id: string; name?: string; roles?: string[]; is_active?: boolean }) =>
    api<UserProviderConfig>(`/providers/me/${configId}/models`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  toggleMyActiveModel: (configId: number, modelId: string, is_active: boolean) =>
    api<UserProviderConfig>(
      `/providers/me/${configId}/models/${encodeURIComponent(modelId)}`,
      { method: "PATCH", body: JSON.stringify({ is_active }) }
    ),
  setMyActiveModelRoles: (configId: number, modelId: string, roles: string[], is_active?: boolean) =>
    api<UserProviderConfig>(`/providers/me/${configId}/models/${encodeURIComponent(modelId)}`, {
      method: "PATCH",
      body: JSON.stringify({ roles, is_active }),
    }),
  memories: (category?: string) =>
    api<MemoryRecord[]>(`/memory?scope=user&active_only=true${category ? `&category=${category}` : ""}`),
  addMemory: (content: string, category: string) =>
    api<MemoryRecord>("/memory", { method: "POST", body: JSON.stringify({ scope: "user", category, content, source: "manual" }) }),
  deleteMemory: (memoryId: number) =>
    api<void>(`/memory/${memoryId}`, { method: "DELETE" }),
  clearMemories: (category?: string) =>
    api<{ deleted: number }>(`/memory?scope=user${category ? `&category=${category}` : ""}`, { method: "DELETE" }),
  createDevicePairing: (data: {
    device_uid: string;
    device_name: string;
    public_key: string;
    platform: string;
    arch: string;
    protocol_version?: string;
    capabilities?: Record<string, unknown>;
  }) => api<DevicePairing>("/devices/pairings", { method: "POST", body: JSON.stringify(data) }),
  confirmDevicePairing: (pairingId: string, code: string) =>
    api<AgentDevice>(`/devices/pairings/${pairingId}/confirm`, { method: "POST", body: JSON.stringify({ code }) }),
  devices: () => api<AgentDevice[]>("/devices"),
  heartbeatDevice: (deviceId: number, capabilities?: Record<string, unknown>) =>
    api<AgentDevice>(`/devices/${deviceId}/heartbeat`, { method: "POST", body: JSON.stringify({ capabilities }) }),
  revokeDevice: (deviceId: number) =>
    api<AgentDevice>(`/devices/${deviceId}/revoke`, { method: "POST" }),
  pluginCatalog: () => api<PluginCatalogItem[]>("/plugins/catalog"),
  pluginInstallations: (deviceId?: number) =>
    api<PluginInstallation[]>(`/plugins/installations${deviceId ? `?device_id=${deviceId}` : ""}`),
  createPluginInstallation: (body: { device_id: number; plugin_id: string; version: string }) =>
    api<PluginInstallation>("/plugins/installations", { method: "POST", body: JSON.stringify(body) }),
  queuePluginOperation: (
    installationId: string,
    operation_type: "install" | "uninstall" | "start" | "stop" | "restart" | "logs" | "update",
    payload?: Record<string, unknown>
  ) =>
    api<PluginOperationResult>(
      `/plugins/installations/${installationId}/operations`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `${installationId}:${operation_type}:${Date.now()}` },
        body: JSON.stringify({ operation_type, payload })
      }
    ),
  pluginLogs: (installationId: string, limit = 80) =>
    api<PluginLog[]>(`/plugins/installations/${installationId}/logs?limit=${limit}`)
};
