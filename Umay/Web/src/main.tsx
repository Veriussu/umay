import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Bot,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  Folder,
  Globe2,
  HardDrive,
  Languages,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MemoryStick,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Pencil,
  Radio,
  Plug,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  Wifi,
  X,
  Zap
} from "lucide-react";
import { ApiError, API_BASE_URL, client, getAccessToken, login, logout, register, rt, sendMessageStream } from "./lib/api";
import { applyBranding, BrandLogo, loadPublicSettings } from "./lib/branding";
import { Markdown } from "./lib/markdown";
import type { ActiveModel, ChatResponse, Citation, Conversation, DataEntry, Message, User } from "./types";
import {
  demoActivity,
  demoAgentNodes,
  demoQuickAccess,
  demoRealtime
} from "./lib/demo";
import { mountOrbStage } from "./lib/orb";
import { PluginCenterModal } from "./PluginCenterModal";
import { UserSettingsModal } from "./UserSettingsModal";
import { loadLocalWeather, weatherGlyph, weatherIconClass, weatherLabel, type WeatherNow } from "./lib/weather";
import "./styles.css";
import "./markdown.css";

type DeviceStatus = {
  cores: number;
  memory: string;
  gpu: string;
  storage: string;
  network: string;
  screen: string;
  online: boolean;
};

function timeLabel(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function clockTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function clamp(value: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, value));
}

function shortTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function worldTime(offsetHours: number) {
  const now = new Date();
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(now.getTime() + offsetHours * 3600_000));
}

function getGpuRenderer() {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "GPU: WebGL yok";
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "GPU: WebGL";
  } catch {
    return "GPU: Bilinmiyor";
  }
}

function readDeviceStatus(): DeviceStatus {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory} GB`
    : "Bilinmiyor";
  const gpu = getGpuRenderer();
  let storage = "Bilinmiyor";
  if (navigator.storage?.estimate) {
    void navigator.storage.estimate().then((estimate) => {
      window.dispatchEvent(new CustomEvent("umay-storage", {
        detail: { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
      }));
    });
  }
  const conn = (navigator as unknown as { connection?: { downlink?: number } }).connection;
  const downlink = conn?.downlink && conn.downlink > 0;
  return {
    cores,
    memory,
    gpu,
    storage,
    network: downlink ? `${conn!.downlink} Mbps` : "1.2 Gbps",
    screen: `${window.screen.width}×${window.screen.height}`,
    online: navigator.onLine
  };
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.length >= 2 ? data : [0, 0];
  const max = Math.max(...points, 1);
  const path = points.map((value, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 100 - (value / max) * 82 - 9;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path d={`${path} L100,100 L0,100 Z`} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Giriş / Kayıt                                                       */
/* ------------------------------------------------------------------ */

function AuthView({ onReady }: { onReady: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await register(fullName, email, password);
      else await login(email, password);
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-brand">
          <BrandLogo
            category="logo"
            imgClassName="auth-brand-logo"
            fallback={<span className="auth-logo">U</span>}
          />
          <h1>UMAY</h1>
          <small>AI OPERATING SYSTEM</small>
        </div>
        <p className="auth-hero">DAHA FAZLA MÜMKÜN</p>
        <p className="auth-sub">Kişisel yapay zeka asistanın. Hafıza, arama ve canlı bilgi kaynakları tek akışta.</p>
        <form className="auth-card" onSubmit={submit}>
          <div className="segmented">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Giriş</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Kayıt</button>
          </div>
          {mode === "register" && (
            <label>
              Ad Soyad
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} required />
            </label>
          )}
          <label>
            E-posta
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Şifre
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary-btn" disabled={busy}>
            {busy ? "Bağlanıyor..." : mode === "login" ? "Giriş Yap" : "Hesap Oluştur"}
          </button>
        </form>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Panel kabuğu                                                        */
/* ------------------------------------------------------------------ */

function Panel({ title, badge, badgeTone = "green", action, children, className = "" }: { title: string; badge?: string; badgeTone?: "green" | "cyan"; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ops-panel ${className}`}>
      <div className="panel-title">
        <h2>{title}</h2>
        <div className="panel-title-right">
          {badge ? <span className={`mini-badge tone-${badgeTone}`}>{badge}</span> : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function iconFor(kind: string, size = 17) {
  switch (kind) {
    case "cpu": return <Cpu size={size} />;
    case "ram": return <MemoryStick size={size} />;
    case "gpu": return <Zap size={size} />;
    case "disk": return <HardDrive size={size} />;
    case "bot": return <Bot size={size} />;
    case "search": return <Search size={size} />;
    case "globe": return <Globe2 size={size} />;
    case "database": return <Database size={size} />;
    case "mic": return <Mic size={size} />;
    case "shield": return <ShieldCheck size={size} />;
    case "calendar": return <CalendarDays size={size} />;
    case "bell": return <Bell size={size} />;
    case "memory": return <Database size={size} />;
    case "code": return <FileText size={size} />;
    case "browser": return <Globe2 size={size} />;
    case "wand": return <Wand2 size={size} />;
    case "system": return <Radio size={size} />;
    case "folder": return <Folder size={size} />;
    case "mail": return <Mail size={size} />;
    case "file": return <FileText size={size} />;
    case "lang": return <Languages size={size} />;
    case "calc": return <Calculator size={size} />;
    default: return <Activity size={size} />;
  }
}

/* ------------------------------------------------------------------ */
/* Sol sütun: Sistem Durumu (canlı + sparkline)                        */
/* ------------------------------------------------------------------ */

type ServiceProbe = { name: string; icon: string; run: () => Promise<unknown> };
type ServiceState = ServiceProbe & { ok: boolean; ms: number | null; checking: boolean };
type LiveEvent = { agent: string; note: string; icon: string };

const SERVICE_PROBES: ServiceProbe[] = [
  { name: "Kimlik Geçidi", icon: "shield", run: () => client.me() },
  { name: "Sohbet Servisi", icon: "bot", run: () => client.conversations() },
  { name: "Haber Ajanı", icon: "globe", run: () => client.rssEntries() },
  { name: "Hatırlatıcı", icon: "calendar", run: () => client.reminders() },
  { name: "Model Sağlayıcı", icon: "zap", run: () => client.activeModels() },
  {
    name: "API Ağ Geçidi",
    icon: "radio",
    run: () => fetch(`${API_BASE_URL}/`).then((res) => {
      if (!res) throw new Error("ağ hatası");
      return res.text();
    })
  }
];

type MetricState = { percent: number; history: number[] };

function SystemStatusPanel({ status }: { status: DeviceStatus | null }) {
  const [cpu, setCpu] = useState<MetricState>(() => ({ percent: 24, history: Array.from({ length: 22 }, () => 18 + Math.random() * 14) }));
  const [ram, setRam] = useState<MetricState>(() => ({ percent: 41, history: Array.from({ length: 22 }, () => 36 + Math.random() * 10) }));
  const [gpu, setGpu] = useState<MetricState>(() => ({ percent: 8, history: Array.from({ length: 22 }, () => 5 + Math.random() * 7) }));
  const [disk, setDisk] = useState<MetricState>(() => ({ percent: 32, history: Array.from({ length: 22 }, () => 31 + Math.random() * 3) }));
  const [diskLabel, setDiskLabel] = useState("152 / 476 GB");
  const [netDown, setNetDown] = useState<number | null>(null);
  const [netType, setNetType] = useState("");

  useEffect(() => {
    const tick = window.setInterval(() => {
      setCpu((m) => {
        const percent = clamp(Math.round(m.percent + Math.random() * 14 - 7), 6, 72);
        return { percent, history: [...m.history.slice(1), percent] };
      });
      setRam((m) => {
        const percent = clamp(Math.round(m.percent + Math.random() * 4 - 2), 25, 74);
        return { percent, history: [...m.history.slice(1), percent] };
      });
      setGpu((m) => {
        const percent = clamp(Math.round(m.percent + Math.random() * 5 - 2.5), 3, 16);
        return { percent, history: [...m.history.slice(1), percent] };
      });
      setDisk((m) => {
        const percent = clamp(Math.round(m.percent + Math.random() * 1 - 0.5), 28, 40);
        return { percent, history: [...m.history.slice(1), percent] };
      });
    }, 2_500);

    const conn = (navigator as unknown as { connection?: { downlink?: number; effectiveType?: string } }).connection;
    if (conn) {
      if (conn.downlink) setNetDown(conn.downlink);
      if (conn.effectiveType) setNetType(conn.effectiveType);
    }

    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ usage?: number; quota?: number }>).detail || {};
      if (detail.usage != null && detail.quota) {
        const pct = Math.min(99, Math.round((detail.usage / detail.quota) * 100));
        setDisk({ percent: pct, history: Array.from({ length: 22 }, () => pct) });
        setDiskLabel(`${(detail.usage / 1e9).toFixed(1)} / ${(detail.quota / 1e9).toFixed(0)} GB`);
      }
    };
    window.addEventListener("umay-storage", onStorage);

    return () => {
      window.clearInterval(tick);
      window.removeEventListener("umay-storage", onStorage);
    };
  }, []);

  const ramTotal = status?.memory && status.memory !== "Bilinmiyor" ? parseFloat(status.memory) : 16;
  const down = netDown != null ? `${netDown.toFixed(1)} Mbps` : "32 Mbps";

  const rows = [
    { key: "cpu", label: "CPU", metric: cpu, detail: `2.4 / 10.0 GHz · ${status?.cores || 4} çekirdek`, icon: "cpu", color: "#38bdf8" },
    { key: "ram", label: "RAM", metric: ram, detail: `${(ramTotal * ram.percent / 100).toFixed(1)} / ${ramTotal} GB`, icon: "ram", color: "#34d399" },
    { key: "gpu", label: "GPU", metric: gpu, detail: "0.6 / 8 GB", icon: "gpu", color: "#a78bfa" },
    { key: "disk", label: "DISK", metric: disk, detail: diskLabel, icon: "disk", color: "#fbbf24" }
  ];

  return (
    <Panel title="Sistem Durumu">
      <div className="system-list">
        {rows.map((row) => (
          <div className="system-row" key={row.key}>
            <div
              className="system-ring"
              style={{ "--level": row.metric.percent, "--ring-color": row.color } as React.CSSProperties}
            >
              {iconFor(row.icon, 18)}
            </div>
            <div className="system-row-main">
              <div className="system-row-head">
                <strong>{row.label}</strong>
                <b>{row.metric.percent}%</b>
              </div>
              <span className="system-detail">{row.detail}</span>
              <div className="system-spark">
                <Sparkline data={row.metric.history} color={row.color} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="net-row">
        <Wifi size={14} />
        <span>{down}<span>↓</span></span>
        <span>{netDown != null ? `${Math.max(0.4, netDown / 2.2).toFixed(1)} Mbps` : "19 Mbps"}<span>↑</span></span>
        <em>{netType || status?.network || "canlı bağlantı"}</em>
      </div>
    </Panel>
  );
}

function RssFeedPanel({ entries }: { entries: DataEntry[] }) {
  const items = entries.slice(0, 10);
  return (
    <Panel title="RSS Akışı" badge={items.length ? "canlı" : "beklemede"} badgeTone={items.length ? "green" : "cyan"} className="rss-panel">
      <div className="rss-list hidden-scroll">
        {items.map((item) => (
          <a className="rss-item" key={item.id} href={item.url || "#"} target="_blank" rel="noreferrer">
            <span className="rss-dot" />
            <span className="rss-title">{item.title}</span>
            <small>{shortTime(item.published_at || item.fetched_at)}</small>
          </a>
        ))}
        {items.length === 0 && <p className="muted">Henüz RSS verisi çekilmedi.</p>}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Orta sütun                                                          */
/* ------------------------------------------------------------------ */

function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="citations">
      {citations.slice(0, 4).map((citation, index) => (
        <a key={`${citation.source_type}-${citation.source_id}-${index}`} href={citation.url || "#"} target="_blank" rel="noreferrer">
          <span>{citation.source_type}</span>
          {citation.title}
        </a>
      ))}
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const mine = message.role === "user";
  const meta = message.meta as { citations?: Citation[] } | null;
  return (
    <article className={`bubble ${mine ? "mine" : "assistant"}`}>
      <div className="bubble-head">
        {mine ? <UserRound size={13} /> : <Bot size={13} />}
        <span>{mine ? "SEN" : "UMAY"}</span>
        <time>{timeLabel(message.created_at)}</time>
      </div>
      {/* Kullanıcının yazdığı olduğu gibi kalır; Umay'ın cevabı
          markdown olarak işlenir (model zaten markdown üretiyor). */}
      <div className="bubble-body">{mine ? message.content : <Markdown>{message.content}</Markdown>}</div>
      {!mine && <CitationList citations={meta?.citations || []} />}
    </article>
  );
}

function CoreStage({
  active,
  messages,
  akis,
  input,
  useSearch,
  busy,
  error,
  endRef,
  setInput,
  setUseSearch,
  submit,
  sendCurrentMessage
}: {
  active: Conversation | null;
  messages: Message[];
  akis: ReturnType<typeof useAkipliSohbet>;
  input: string;
  useSearch: boolean;
  busy: boolean;
  error: string;
  endRef: React.RefObject<HTMLDivElement | null>;
  setInput: (value: string) => void;
  setUseSearch: (value: boolean) => void;
  submit: (event: FormEvent) => void;
  sendCurrentMessage: () => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatVisible = messages.length > 0 || busy || Boolean(akis.metin);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  // Aşama adımları gerçek backend olaylarından gelir; metin akmaya
  // başlayınca adım listesi işini bitirdiği için gizlenir.
  const sonAdim = akis.adimlar.length ? akis.adimlar[akis.adimlar.length - 1] : null;

  useEffect(() => {
    if (!canvasRef.current) return;
    return mountOrbStage(canvasRef.current, () => busyRef.current);
  }, []);

  return (
    <section className="core-stage">
      <div className="core-caption">
        <h1>
          {busy && <Loader2 className="thinking-spinner" size={26} />}
          {busy ? "DÜŞÜNÜYOR" : active?.title ? active.title.toUpperCase() : "DÜŞÜNÜYOR"}
        </h1>
        <p>{sonAdim && !sonAdim.done ? sonAdim.label : "Planlıyor, araştırıyor, senin için çalışıyor..."}</p>
      </div>

      <div className="orb-wrap">
        <canvas ref={canvasRef} className="orb-canvas" />
        <div className="orb-text">
          <strong>UMAY</strong>
          <span>CORE</span>
        </div>

        <div className="agent-nodes">
          {demoAgentNodes.map((node) => (
            <div className={`agent-node ${node.pos}`} key={node.name} style={{ "--node-color": node.color } as React.CSSProperties}>
              <span className="agent-node-icon">{iconFor(node.icon, 15)}</span>
              <span>
                <strong>{node.name}</strong>
                <small>{node.desc}</small>
              </span>
            </div>
          ))}
        </div>

        <div className={`chat-overlay hidden-scroll ${chatVisible ? "" : "hidden"}`}>
          {messages.slice(-14).map((message) => <ChatBubble key={message.id} message={message} />)}
          {/* GEÇİCİ balon: harf harf büyür, `bitti` ile temizlenir. */}
          {akis.metin && (
            <div className="bubble assistant akis-bubble">
              <div className="bubble-head">
                <Bot size={13} />
                <span>UMAY</span>
                <time>{clockTime(new Date())}</time>
              </div>
              <div className="bubble-body">
                <Markdown>{akis.metin}</Markdown>
                <span className="akis-imleç" aria-hidden="true" />
              </div>
            </div>
          )}
          {busy && !akis.metin && <div className="typing">{sonAdim ? sonAdim.label : "Umay düşünüyor..."}</div>}
          <div ref={endRef} />
        </div>
      </div>

      {error && <div className="toast">{error}</div>}

      <form className="composer" onSubmit={submit}>
        <button type="button" className="round-action" aria-label="Ses"><Mic size={19} /></button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Umay'a bir şey söyle veya yaz..."
          rows={1}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendCurrentMessage();
            }
          }}
        />
        <button type="button" className="round-action" aria-label="Dosya"><Paperclip size={19} /></button>
        <label className="search-toggle" title="Canlı kaynak">
          <input type="checkbox" checked={useSearch} onChange={(e) => setUseSearch(e.target.checked)} />
          <Globe2 size={18} />
        </label>
        <button className="send-btn" disabled={busy || !input.trim()} aria-label="Gönder"><Send size={19} /></button>
      </form>

      <div className="prompt-actions">
        <button onClick={() => void sendCurrentMessage()}><Search size={14} /> Araştır</button>
        <button onClick={() => void sendCurrentMessage()}><Globe2 size={14} /> İnternette Ara</button>
        <button onClick={() => void sendCurrentMessage()}><Wand2 size={14} /> Görsel Üret</button>
        <button onClick={() => void sendCurrentMessage()}><FileText size={14} /> Kod Yaz</button>
        <button onClick={() => void sendCurrentMessage()}><Sparkles size={14} /> Dosya Analiz Et</button>
        <button onClick={() => void sendCurrentMessage()}><CalendarDays size={14} /> Plan Oluştur</button>
        <button onClick={() => setInput(input)} aria-label="Daha fazla">···</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Alt sıra: harita + haber + görevler                                 */
/* ------------------------------------------------------------------ */

function WeatherPanel({ weather }: { weather: WeatherNow | null }) {
  if (!weather) {
    return (
      <Panel title="Hava Durumu" badge="yükleniyor" badgeTone="cyan" className="weather-panel">
        <div className="weather-body"><p className="muted">Konum ve hava verileri alınıyor…</p></div>
      </Panel>
    );
  }
  return (
    <Panel title="Hava Durumu" badge={weather.place} badgeTone="cyan" className="weather-panel">
      <div className="weather-body">
        <span className={`weather-icon ${weatherIconClass(weather.code, weather.isDay)}`}>
          {weatherGlyph(weather.code, weather.isDay)}
        </span>
        <div className="weather-temp">
          <strong>{weather.temperature != null ? `${Math.round(weather.temperature)}°` : "—"}C</strong>
          <span>{weatherLabel(weather.code)}</span>
        </div>
        <div className="weather-meta">
          <span>Hissedilen <b>{weather.apparent != null ? `${Math.round(weather.apparent)}°` : "—"}</b></span>
          <span>Nem <b>{weather.humidity != null ? `${weather.humidity}%` : "—"}</b></span>
          <span>Rüzgar <b>{weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/s` : "—"}</b></span>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Sağ sütun                                                           */
/* ------------------------------------------------------------------ */

function LastAnswerPanel({ messages }: { messages: Message[] }) {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  return (
    <div className="answer-panel">
      {last ? (
        <div className="answer-bubble">
          <div className="answer-head"><Bot size={14} /><strong>UMAY</strong><time>{shortTime(last.created_at)}</time></div>
          <div className="answer-body"><Markdown>{last.content}</Markdown></div>
        </div>
      ) : (
        <div className="answer-bubble">
          <div className="answer-head"><Bot size={14} /><strong>UMAY</strong><time>{shortTime(new Date().toISOString())}</time></div>
          <p>Merhaba! Bugün senin için neler yapabilirim?</p>
        </div>
      )}
    </div>
  );
}

function ActivityPanel({ now, busy, live }: { now: Date; busy: boolean; live: LiveEvent[] }) {
  const base = demoActivity.map((row, index) => ({
    ...row,
    time: clockTime(new Date(now.getTime() - (index * 2 + 1) * 60_000))
  }));
  const rows = [
    ...live.map((event) => ({ ...event, time: "şimdi" })),
    ...(busy ? [{ time: "şimdi", agent: "Sohbet Ajanı", note: "Yanıt üretiliyor...", icon: "bot" }] : []),
    ...base
  ].slice(0, 9);
  return (
    <Panel title="Canlı Aktivite Akışı" badge={busy ? "ajan çalışıyor" : "hazır"}>
      <div className="activity-list hidden-scroll">
        {rows.map((row, index) => (
          <div className={`activity-item ${row.time === "şimdi" ? "is-now" : ""}`} key={`${row.agent}-${row.time}-${index}`}>
            <time>{row.time}</time>
            <span className="activity-icon">{iconFor(row.icon, 13)}</span>
            <div>
              <strong>{row.agent}</strong>
              <small>{row.note}</small>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RealtimePanel({ models, tokenTotal, latency, apiRequests }: { models: ActiveModel[]; tokenTotal: number; latency: number | null; apiRequests: number }) {
  const primary = models[0];
  const cells = [
    { label: "API İstekleri", value: apiRequests ? apiRequests.toLocaleString("tr-TR") : demoRealtime.apiRequests, unit: apiRequests ? "/ oturum" : demoRealtime.apiUnit },
    { label: "Token Kullanımı", value: tokenTotal ? tokenTotal.toLocaleString("tr-TR") : demoRealtime.tokenUsage, unit: tokenTotal ? "" : demoRealtime.tokenUnit },
    { label: "Yanıt Süresi", value: latency ? `${(latency / 1000).toFixed(1)} sn` : demoRealtime.latency, unit: "" },
    { label: "Ağ Trafiği", value: demoRealtime.netDown, unit: "" }
  ];
  return (
    <Panel title="Gerçek Zamanlı Veriler">
      <div className="realtime-grid">
        {cells.map((cell) => (
          <div key={cell.label} title={primary && cell.label === "Ağ Trafiği" ? `Aktif model: ${primary.name}` : cell.value}>
            <span>{cell.label}</span>
            <strong>{cell.value}{cell.unit && <em>{cell.unit}</em>}</strong>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function QuickAccessPanel() {
  return (
    <Panel title="Hızlı Erişim">
      <div className="quick-grid">
        {demoQuickAccess.map((link) => (
          <a href="#" key={link.label} onClick={(e) => e.preventDefault()}>
            {iconFor(link.icon, 19)}
            <span>{link.label}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Akışlı sohbet kancası                                               */
/* ------------------------------------------------------------------ */

type ThinkStep = { label: string; at: Date; done: boolean };

/** Araç adları ekranda İngilizce görünmesin. */
const ARAC_ADLARI: Record<string, string> = {
  web_search: "Web araması",
  fetch_page: "Sayfa okuma",
  memory_search: "Hafıza araması",
  memory_remember: "Hafızaya yazma",
  memory_forget: "Hafızadan silme"
};

/**
 * `POST /messages/stream` uçunu okur ve üç parçayı yönetir:
 *   - aşama ilerlemesi (GERÇEK backend olayları, sahte zamanlayıcı yok)
 *   - geçici cevap metni (harf harf büyür)
 *   - kalan iş (kalıcı mesaja yazma, liste tazeleme) çağıranın işidir
 *
 * `metin` GEÇİCİDİR. `bitti` olayı gelince temizlenmiş cevap `bitti`
 * içindeki kalıcı mesajla değiştirilir; bu yüzden akış hatasında metni
 * siliyoruz — yarım/araç sızıntılı olabilir.
 */
function useAkipliSohbet() {
  const [metin, setMetin] = useState("");
  const [adimlar, setAdimlar] = useState<ThinkStep[]>([]);
  const [aktif, setAktif] = useState(false);
  const iptalRef = useRef<AbortController | null>(null);

  useEffect(() => () => iptalRef.current?.abort(), []);

  const adimEkle = useCallback((etiket: string, kapandi = false) => {
    setAdimlar((oncekiler) => [
      ...oncekiler.map((adim) => ({ ...adim, done: true })),
      { label: etiket, at: new Date(), done: kapandi }
    ]);
  }, []);

  const sifirla = useCallback(() => {
    setMetin("");
    setAdimlar([]);
  }, []);

  async function gonder(
    sohbetNo: number,
    icerik: string,
    arama: boolean
  ): Promise<ChatResponse> {
    iptalRef.current?.abort();
    const iptal = new AbortController();
    iptalRef.current = iptal;
    setMetin("");
    setAktif(true);
    adimEkle("Mesaj alındı", true);
    try {
      return await sendMessageStream(
        sohbetNo,
        icerik,
        arama,
        {
          onDurum: (_ad, aciklama) => adimEkle(aciklama),
          onArac: (adlar) => {
            const okunur = adlar.map((ad) => ARAC_ADLARI[ad] || ad);
            if (okunur.length) adimEkle(`${okunur.join(", ")} çalıştı`);
          },
          onMetin: (parca) => setMetin((onceki) => onceki + parca)
        },
        iptal.signal
      );
    } finally {
      if (iptalRef.current === iptal) iptalRef.current = null;
      // Akış tamamlanınca AÇILAN son adımı kapat; metin çağıranın
      // kalıcı mesajı yazana kadar burada durur (geçici balon).
      setAktif(false);
      setAdimlar((oncekiler) => oncekiler.map((adim) => ({ ...adim, done: true })));
    }
  }

  return { metin, adimlar, aktif, gonder, adimEkle, sifirla };
}

/* ------------------------------------------------------------------ */
/* Sohbet Merkezi (popup)                                              */
/* ------------------------------------------------------------------ */

function ChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [useSearch, setUseSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const akis = useAkipliSohbet();
  const [snippets, setSnippets] = useState<Record<number, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError("");
    setConfirmDeleteId(null);
    setRenamingId(null);
    client.conversations()
      .then(setConversations)
      .catch((err) => setError(err instanceof Error ? err.message : "Sohbetler alınamadı."));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    client.messages(activeId)
      .then((rows) => {
        setMessages(rows);
        const last = [...rows].reverse().find((m) => m.role === "assistant" || m.role === "user");
        if (last) setSnippets((map) => ({ ...map, [activeId]: last.content.slice(0, 60) }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Mesajlar alınamadı."));
  }, [activeId]);

  useEffect(() => {
    const el = listRef.current;
    // `akis.metin` her harf geldiğinde tetiklenir: yazarken de takip et.
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, akis.metin, akis.adimlar, activeId]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open, activeId]);

  useEffect(() => {
    if (renamingId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [conversations, query]);

  /* Eski `scheduleStep` (500/1050/1650/2350 ms'lik SAHNE zamanlayıcısı)
     kaldırıldı: adımlar artık backend'den gelen gerçek olaylarla geliyor.
     Zamanlayıcı, backend yavaşladığında ekranda yalan adım gösterirdi. */

  async function createChat() {
    try {
      const created = await client.createConversation("Yeni sohbet");
      setConversations((rows) => [created, ...rows]);
      setActiveId(created.id);
      setMessages([]);
      setQuery("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet oluşturulamadı.");
    }
  }

  async function submitRename() {
    if (renamingId === null || renameBusy) return;
    const title = renameDraft.trim();
    if (!title) return;
    setRenameBusy(true);
    try {
      const updated = await client.renameConversation(renamingId, title);
      setConversations((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setRenamingId(null);
      setRenameDraft("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet yeniden adlandırılamadı.");
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmDelete() {
    if (confirmDeleteId === null || deleting) return;
    setDeleting(true);
    try {
      await client.deleteConversation(confirmDeleteId);
      const removedId = confirmDeleteId;
      setConversations((rows) => rows.filter((row) => row.id !== removedId));
      setConfirmDeleteId(null);
      setError("");
      if (activeIdRef.current === removedId) {
        setActiveId(null);
        setMessages([]);
      }
      setSnippets((map) => {
        const next = { ...map };
        delete next[removedId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sohbet silinemedi.");
    } finally {
      setDeleting(false);
    }
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");

    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await client.createConversation(text.slice(0, 60));
        setConversations((rows) => [created, ...rows]);
        setActiveId(created.id);
        conversationId = created.id;
      }
      setInput("");
      // Akışlı: aşamalar ve cevap metni yazarken gelir.
      const sent = await akis.gonder(conversationId, text, useSearch);
      const assistantMessage = {
        ...sent.message,
        meta: { ...(sent.message.meta || {}), citations: sent.citations }
      };
      // `bitti` geldi: geçici metni kalıcı mesajla değiştir.
      akis.sifirla();
      const rows = await client.messages(conversationId);
      if (activeIdRef.current === conversationId) {
        setMessages(rows.map((row) => row.id === sent.message.id ? assistantMessage : row));
      }
      setSnippets((map) => ({ ...map, [conversationId]: sent.message.content.slice(0, 60) }));
      akis.adimEkle("İşlem tamamlandı", true);
      const latest = await client.conversations().catch(() => null);
      if (latest) setConversations(latest);
      window.setTimeout(() => akis.sifirla(), 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
      // Geçici metin silinir: yarım/araç sızıntılı olabilir, kalıcı
      // mesaja dönüşmedi. Kalıcı olmayan metni göstermek yanıltıcı olurdu.
      akis.sifirla();
      akis.adimEkle("Bir hata oluştu — tekrar dene", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cm-modal" role="dialog" aria-modal="true" aria-label="Sohbet Merkezi">
        <header className="cm-head">
          <span className="cm-logo">
            <BrandLogo category="logo" imgClassName="cm-logo-img" fallback={<MessageSquarePlus size={17} />} />
          </span>
          <h2>SOHBET MERKEZİ</h2>
          <span className="mini-badge tone-cyan cm-badge">{conversations.length} sohbet</span>
          {busy
            ? <span className="live-dot off cm-status">düşünüyor</span>
            : <span className="live-dot cm-status">hazır</span>}
          <button className="icon-btn cm-close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </header>

        <div className="cm-body">
          <aside className="cm-side">
            <div className="cm-side-tools">
              <div className="top-search cm-search">
                <Search size={15} />
                <input placeholder="Sohbet ara..." value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <button className="primary-btn cm-new" onClick={createChat}><Sparkles size={15} /> Yeni Sohbet</button>
            </div>
            <div className="cm-conv-list hidden-scroll">
              {filtered.map((conversation) => (
                <div
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  className={`cm-conv ${conversation.id === activeId ? "active" : ""}`}
                  onClick={() => setActiveId(conversation.id)}
                  onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) setActiveId(conversation.id); }}
                >
                  <span className="cm-conv-icon">{iconFor("system", 15)}</span>
                  <span className="cm-conv-main">
                    {renamingId === conversation.id ? (
                      <form
                        className="cm-rename"
                        onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submitRename(); }}
                      >
                        <input
                          ref={renameInputRef}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.stopPropagation();
                              setRenamingId(null);
                            }
                          }}
                          onBlur={() => setRenamingId(null)}
                          maxLength={80}
                          placeholder="Sohbet adı"
                        />
                        <button
                          type="submit"
                          className="cm-rename-save"
                          disabled={renameBusy || !renameDraft.trim()}
                          aria-label="Kaydet"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {renameBusy ? <Loader2 size={13} className="cm-rename-spin" /> : <CheckCircle2 size={13} />}
                        </button>
                      </form>
                    ) : (
                      <>
                        <strong>{conversation.title || "Yeni sohbet"}</strong>
                        <small>{snippets[conversation.id] || (conversation.last_message_at ? "Sohbet gönderildi" : "Henüz mesaj yok")}</small>
                      </>
                    )}
                  </span>
                  {renamingId === conversation.id ? (
                    <span className="cm-conv-time-ph" />
                    ) : (
                    <>
                      <time>{shortTime(conversation.last_message_at || conversation.updated_at)}</time>
                      <span className="cm-conv-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="cm-conv-act"
                          title="Yeniden adlandır"
                          aria-label="Yeniden adlandır"
                          onClick={() => {
                            setRenamingId(conversation.id);
                            setRenameDraft(conversation.title || "");
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="cm-conv-act danger"
                          title="Sohbeti sil"
                          aria-label="Sohbeti sil"
                          onClick={() => setConfirmDeleteId(conversation.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="muted center cm-empty-hint">
                  {conversations.length === 0 ? "Henüz sohbet yok — yeni sohbet başlat." : "Arama sonucu bulunamadı."}</p>
              )}
            </div>
          </aside>

          <div className="cm-chat">
            <div className="cm-chat-head">
              <div className="cm-chat-title">
                <strong>{active?.title || "Sohbet"}</strong>
                <span>{active ? (busy ? "Umay yanıtlıyor — işler planlanıyor…" : "Bağlantı hazır") : "Sohbet içeriği"}</span>
              </div>
              {active && (
                <button
                  type="button"
                  className="cm-conv-act cm-title-rename"
                  title="Yeniden adlandır"
                  aria-label="Yeniden adlandır"
                  onClick={() => {
                    setRenamingId(active.id);
                    setRenameDraft(active.title || "");
                  }}
                >
                  <Pencil size={13} />
                </button>
              )}
              <span className="cm-model-chip">
                <Zap size={13} />
                Canlı Kaynak {useSearch ? "AÇIK" : "KAPALI"}
              </span>
            </div>

            <div className="cm-messages hidden-scroll" ref={listRef}>
              {messages.map((message) => <ChatBubble key={message.id} message={message} />)}

              {/* GEÇİCİ balon: akıştan gelen metin harf harf büyür.
                  `bitti` olayında `akis.sifirla()` ile temizlenir ve
                  kalıcı mesaj (yukarıda) ekrana gelir. */}
              {akis.metin && (
                <div className="bubble assistant akis-bubble">
                  <div className="bubble-head">
                    <Bot size={13} />
                    <span>UMAY</span>
                    <time>{clockTime(new Date())}</time>
                  </div>
                  <div className="bubble-body">
                    <Markdown>{akis.metin}</Markdown>
                    <span className="akis-imleç" aria-hidden="true" />
                  </div>
                </div>
              )}

              {busy && akis.adimlar.length > 0 && (
                <div className="cm-think">
                  <div className="cm-think-head">
                    <Loader2 className="cm-think-spin" size={14} />
                    Umay işliyor
                  </div>
                  {akis.adimlar.map((step, index) => (
                    <div className={`cm-step ${step.done ? "done" : "active"}`} key={index}>
                      {step.done
                        ? <CheckCircle2 size={13} />
                        : <Loader2 className="cm-step-spin" size={13} />}
                      <span>{step.label}</span>
                      <time>{clockTime(step.at)}</time>
                    </div>
                  ))}
                </div>
              )}

              {!busy && messages.length === 0 && !activeId && (
                <div className="cm-welcome">
                  <span className="cm-welcome-orb"><Bot size={26} /></span>
                  <strong>Konuşmaya başla</strong>
                  <p>Soldan bir sohbet seç ya da yeni bir sohbet başlat. Umay her an yanında.</p>
                </div>
              )}
              {!busy && messages.length === 0 && activeId && (
                <p className="muted center">Bu sohbette henüz mesaj yok. İlk mesajını yaz.</p>
              )}
            </div>

            {error && <div className="toast cm-toast">{error}</div>}

            <form
              className="composer cm-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
            >
              <button type="button" className="round-action" aria-label="Ses"><Mic size={19} /></button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Umay'a bir şey söyle veya yaz..."
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
              />
              <button type="button" className="round-action" aria-label="Dosya"><Paperclip size={19} /></button>
              <label className="search-toggle" title="Canlı kaynak">
                <input type="checkbox" checked={useSearch} onChange={(e) => setUseSearch(e.target.checked)} />
                <Globe2 size={18} />
              </label>
              <button className="send-btn" disabled={busy || !input.trim()} aria-label="Gönder"><Send size={19} /></button>
            </form>
          </div>
        </div>

        {confirmDeleteId !== null && (
          <div className="cm-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setConfirmDeleteId(null); }}>
            <div className="cm-confirm" role="alertdialog" aria-modal="true" aria-label="Sohbeti sil">
              <span className="cm-confirm-icon"><Trash2 size={20} /></span>
              <h3>Sohbet silinsin mi?</h3>
              <p>
                <strong>"{conversations.find((c) => c.id === confirmDeleteId)?.title || "Yeni sohbet"}"</strong> sohbeti ve tüm mesajları kalıcı olarak silinecek. Bu işlem geri alınamaz.
              </p>
              <div className="cm-confirm-actions">
                <button type="button" className="cm-confirm-cancel" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Vazgeç</button>
                <button type="button" className="cm-confirm-delete" onClick={() => void confirmDelete()} disabled={deleting}>
                  {deleting ? <Loader2 size={14} className="cm-rename-spin" /> : <Trash2 size={14} />}
                  {deleting ? "Siliniyor..." : "Sil"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Uygulama kabuğu                                                     */
/* ------------------------------------------------------------------ */

function AppView({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<ActiveModel[]>([]);
  const [entries, setEntries] = useState<DataEntry[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [input, setInput] = useState("");
  const [useSearch, setUseSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const akis = useAkipliSohbet();
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [apiRequests, setApiRequests] = useState(rt.calls);
  const [services, setServices] = useState<ServiceState[]>(SERVICE_PROBES.map((probe) => ({ ...probe, ok: false, ms: null, checking: true })));
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId]);
  const tokenTotal = useMemo(() => messages.reduce((total, item) => total + (item.tokens_used || 0), 0), [messages]);

  async function refresh() {
    const [me, rows] = await Promise.all([client.me(), client.conversations()]);
    setUser(me);
    setConversations(rows);
  }

  function pushActivity(agent: string, note: string, icon: string) {
    setLiveEvents((rows) => [{ agent, note, icon }, ...rows].slice(0, 4));
  }

  async function checkServices() {
    const results = await Promise.all(SERVICE_PROBES.map(async (probe) => {
      const started = performance.now();
      try {
        await probe.run();
        return { ...probe, ok: true, ms: Math.max(1, Math.round(performance.now() - started)), checking: false };
      } catch {
        return { ...probe, ok: false, ms: Math.max(1, Math.round(performance.now() - started)), checking: false };
      }
    }));
    setServices(results);
  }

  async function refreshDashboard() {
    const [modelRows, rssRows] = await Promise.allSettled([
      client.activeModels(),
      client.rssEntries()
    ]);
    if (modelRows.status === "fulfilled") setModels(modelRows.value);
    if (rssRows.status === "fulfilled") setEntries(rssRows.value.items.filter((entry) => entry.is_active).slice(0, 40));
  }

  useEffect(() => {
    refresh().catch((err) => {
      if (err instanceof ApiError && err.status === 401) onLogout();
      else setError(err instanceof Error ? err.message : "Bağlantı kurulamadı.");
    });
    void refreshDashboard();
    setDeviceStatus(readDeviceStatus());
    void loadLocalWeather()
      .then(setWeather)
      .catch(() => setWeather(null));
    void checkServices().then(() => pushActivity("İzleme Ajanı", "Servis sağlığı kontrol edildi", "shield"));
    const dashboardTimer = window.setInterval(() => {
      setDeviceStatus(readDeviceStatus());
      void refreshDashboard();
      void checkServices().then(() => pushActivity("İzleme Ajanı", "Servis sağlığı yenilendi", "shield"));
    }, 30_000);
    const weatherTimer = window.setInterval(() => {
      void loadLocalWeather()
        .then(setWeather)
        .catch(() => setWeather(null));
    }, 15 * 60_000);
    const unsub = rt.subscribe(() => setApiRequests(rt.calls));
    return () => {
      window.clearInterval(dashboardTimer);
      window.clearInterval(weatherTimer);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocPointer(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    client.messages(activeId).then(setMessages).catch((err) => setError(err instanceof Error ? err.message : "Mesajlar alınamadı."));
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, akis.metin, akis.adimlar]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await sendCurrentMessage();
  }

  async function sendCurrentMessage() {
    const content = input.trim();
    if (!content || busy) return;
    const started = performance.now();
    setBusy(true);
    setError("");
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const created = await client.createConversation(content.slice(0, 60));
        setConversations((rows) => [created, ...rows]);
        setActiveId(created.id);
        conversationId = created.id;
      }
      setInput("");
      // Akışlı: aşamalar ve cevap metni yazarken gelir.
      const sent = await akis.gonder(conversationId, content, useSearch);
      const assistantMessage = {
        ...sent.message,
        meta: { ...(sent.message.meta || {}), citations: sent.citations }
      };
      // `bitti` geldi: geçici metni kalıcı mesajla değiştir.
      akis.sifirla();
      const rows = await client.messages(conversationId);
      setMessages(rows.map((row) => row.id === sent.message.id ? assistantMessage : row));
      setLastLatency(Math.round(performance.now() - started));
      await refresh();
      await refreshDashboard();
      pushActivity("Sohbet Ajanı", "Yanıt hazırlandı", "bot");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesaj gönderilemedi.");
      // Geçici metin kalıcı mesaja dönüşmedi: yarım kalmış olabilir.
      akis.sifirla();
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    await logout();
    onLogout();
  }

  const tabs = [
    { label: "Ana Ekran", icon: <LayoutGrid size={15} />, active: true },
    { label: "Sohbet", icon: <MessageSquarePlus size={15} />, active: false, onClick: () => setChatOpen(true) },
    { label: "Ajanlar", icon: <Bot size={15} />, active: false },
    { label: "Eklentiler", icon: <Plug size={15} />, active: false, onClick: () => setPluginsOpen(true) },
    { label: "Araçlar", icon: <Settings2 size={15} />, active: false },
    { label: "Kaynaklar", icon: <Database size={15} />, active: false },
    { label: "Projeler", icon: <Folder size={15} />, active: false },
    { label: "Ayarlar", icon: <Settings2 size={15} />, active: false, onClick: () => setSettingsOpen(true) }
  ];

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <div className="ops-brand">
          <BrandLogo
            category="logo"
            imgClassName="brand-logo"
            fallback={<div className="logo-triangle">U</div>}
          />
          <div className="brand-text">
            <strong>UMAY</strong>
            <span>AI OPERATING SYSTEM</span>
          </div>
        </div>
        <small className="brand-slogan">{"DAHA FAZLA\nMÜMKÜN"}</small>

        <nav className="ops-nav">
          {tabs.map((tab) => (
            <button key={tab.label} className={tab.active ? "active" : ""} onClick={tab.onClick}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        <div className="user-wrap" ref={userMenuRef}>
          <button
            type="button"
            className={`user-chip ${userMenuOpen ? "open" : ""}`}
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-label="Kullanıcı menüsü"
            aria-expanded={userMenuOpen}
          >
            <div className="avatar"><UserRound size={17} /></div>
            <span>{user?.full_name?.split(" ")[0] || "Kullanıcı"}<small>Pro Kullanıcı</small></span>
            <ChevronDown size={14} className="chip-chevron" />
          </button>

          {userMenuOpen && (
            <div className="user-menu">
              <div className="user-menu-head">
                <div className="avatar"><UserRound size={17} /></div>
                <div className="user-menu-id">
                  <strong>{user?.full_name || "Kullanıcı"}</strong>
                  <small>{user?.email || ""}</small>
                </div>
              </div>
              <button type="button" className="user-menu-item danger" onClick={doLogout}>
                <LogOut size={15} />
                <span>Çıkış Yap</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="ops-grid">
        <aside className="left-rail">
          <SystemStatusPanel status={deviceStatus} />
          <RssFeedPanel entries={entries} />
        </aside>

        <div className="center-area">
          <CoreStage
            active={active}
            messages={messages}
            akis={akis}
            input={input}
            useSearch={useSearch}
            busy={busy}
            error={error}
            endRef={endRef}
            setInput={setInput}
            setUseSearch={setUseSearch}
            submit={submit}
            sendCurrentMessage={sendCurrentMessage}
          />
          <div className="bottom-row">
            <WeatherPanel weather={weather} />
            <section className="ops-panel empty-panel" aria-label="Boş panel"></section>
            <section className="ops-panel empty-panel" aria-label="Boş panel"></section>
          </div>
        </div>

        <aside className="right-rail">
          <section className="ops-panel empty-panel" aria-label="Boş panel"></section>
        </aside>
      </div>

      <footer className="ops-footer">
        <span className="ops-footer-brand">
          <BrandLogo category="white" imgClassName="footer-logo" fallback={<b>UMAY v1.0.0</b>} />
          <span>· Yapay Zekâ ile Sınırsız Potansiyel</span>
        </span>
        <span>"Hayal Et • Planla • Umay Gerçekleştirsin"</span>
      </footer>

      {chatOpen && <ChatModal open={chatOpen} onClose={() => setChatOpen(false)} />}
      <PluginCenterModal open={pluginsOpen} onClose={() => setPluginsOpen(false)} />
      <UserSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user} onUserUpdated={setUser} />
    </main>
  );
}

function Root() {
  const [authed, setAuthed] = useState(Boolean(getAccessToken()));
  useEffect(() => {
    loadPublicSettings().then((settings) => {
      if (settings) applyBranding(settings);
    });
  }, []);
  return authed ? <AppView onLogout={() => setAuthed(false)} /> : <AuthView onReady={() => setAuthed(true)} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
