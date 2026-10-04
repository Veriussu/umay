import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BrainCircuit,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { client } from "./lib/api";
import type { MemoryRecord, ProviderCatalogEntry, User, UserProviderConfig } from "./types";

type SectionKey = "profile" | "provider" | "models" | "memory";

type Props = {
  open: boolean;
  onClose: () => void;
  user: User | null;
  onUserUpdated: (user: User) => void;
};

const MEMORY_CATEGORIES = ["hobi", "fobi", "tercih", "spesifik", "kişisel", "other"] as const;

/* Model tipi filtresi seçenekleri — ekleme pop up'ı ile aktif liste araç çubuğu paylaşır */
const MODEL_TYPE_OPTIONS = [
  { value: "all", label: "Tüm tipler" },
  { value: "sohbet", label: "Sohbet" },
  { value: "embedding", label: "Embedding" },
  { value: "rerank", label: "Rank" },
  { value: "audio", label: "Ses" },
  { value: "görüntü", label: "Görüntü" },
  { value: "moderation", label: "Moderation" }
] as const;

const MODEL_SORT_OPTIONS = [
  { value: "name", label: "Ada göre (A–Z)" },
  { value: "price-asc", label: "Fiyat artan" },
  { value: "price-desc", label: "Fiyat azalan" }
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  hobi: "Hobi",
  fobi: "Fobi",
  tercih: "Tercih",
  spesifik: "Spesifik",
  "kişisel": "Kişisel",
  other: "Diğer"
};

const ROLE_LABELS: Record<string, string> = {
  chat: "Sohbet",
  search: "Arama",
  memory: "Hafıza",
  computer: "Bilgisayar"
};

const ROLE_KEYS = ["chat", "search", "memory", "computer"] as const;

export function UserSettingsModal({ open, onClose, user, onUserUpdated }: Props) {
  const [section, setSection] = useState<SectionKey>("profile");

  /* Profil */
  const [fullName, setFullName] = useState("");
  const [theme, setTheme] = useState("dark");
  const [language, setLanguage] = useState("tr");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  /* Şifre */
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  /* Provider */
  const [providers, setProviders] = useState<UserProviderConfig[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerEditingId, setProviderEditingId] = useState<number | "new" | null>(null);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerCatalog, setProviderCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [providerCatalogLoading, setProviderCatalogLoading] = useState(false);
  const [pCatalogSel, setPCatalogSel] = useState("");
  const [pName, setPName] = useState("");
  const [pServer, setPServer] = useState("");
  const [pKey, setPKey] = useState("");
  const [pModel, setPModel] = useState("");
  const [confirmDeleteProviderId, setConfirmDeleteProviderId] = useState<number | null>(null);

  /* Modeller — aktif modeller + ekleme pop up'ı */
  const [userModelBusy, setUserModelBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addType, setAddType] = useState("all");
  const [addSort, setAddSort] = useState("name");
  const [addSyncing, setAddSyncing] = useState(false);
  const [addSyncError, setAddSyncError] = useState("");
  /* Rol atama pop up'ı */
  const [rolePopup, setRolePopup] = useState<{ configId: number; modelId: string; name: string } | null>(null);
  const [roleDraft, setRoleDraft] = useState<string[]>([]);
  /* Model silme onayı */
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<{ configId: number; modelId: string; name: string } | null>(null);

  /* Hafıza */
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [memCategory, setMemCategory] = useState<string>("other");
  const [memContent, setMemContent] = useState("");
  const [memBusy, setMemBusy] = useState(false);
  const [memFilter, setMemFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setSection("profile");
    setConfirmClear(false);
    setConfirmDeleteId(null);
    setConfirmDeleteProviderId(null);
    setProviderEditingId(null);
    setAddOpen(false);
    setAddType("all");
    setAddSort("name");
    setRolePopup(null);
    setConfirmDeleteModel(null);
    setFullName(user?.full_name || "");
    setTheme(user?.theme || "dark");
    setLanguage(user?.language || "tr");
    setProviderLoading(true);
    client
      .myProviders()
      .then(setProviders)
      .catch(() => setProviders([]))
      .finally(() => setProviderLoading(false));
    setMemLoading(true);
    client
      .memories()
      .then(setMemories)
      .catch(() => setMemories([]))
      .finally(() => setMemLoading(false));
  }, [open, user?.id]);

  const filteredMemories = useMemo(() => {
    if (!memFilter) return memories;
    return memories.filter((m) => m.category === memFilter);
  }, [memories, memFilter]);

  function replaceProvider(updated: UserProviderConfig) {
    setProviders((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
  }

  /* Ekleme pop up'ı için: aktif provider'ın çekilmiş ama henüz eklenmemiş modelleri */
  const activeProvider = providers.find((p) => p.is_active) || providers[0] || null;
  const activeProviderId = activeProvider?.id ?? -1;
  const addPool = useMemo(() => {
    if (!activeProvider) return [];
    const cfg = activeProvider;
    const auto = cfg.auto_fetched_models || {};
    const active = new Set(cfg.active_models || []);
    const q = addSearch.trim().toLowerCase();
    return Object.values(auto)
      .filter((info): info is { model_id: string; name?: string; metadata?: Record<string, unknown> | undefined } => Boolean(info?.model_id))
      .filter((info) => !active.has(info.model_id))
      .filter((info) => {
        if (!q) return true;
        const name = (info.name || "").toLowerCase();
        return info.model_id.toLowerCase().includes(q) || name.includes(q);
      })
      .map((info) => {
        const type = modelTypeOf(info);
        const price = modelPriceOf(info);
        return { ...info, type, price, priceText: price === null ? "" : formatModelPrice(price) };
      })
      .filter((info) => addType === "all" || info.type === addType)
      .sort((a, b) => {
        if (addSort === "price-asc" || addSort === "price-desc") {
          if (a.price === null && b.price === null) return (a.name || a.model_id).localeCompare(b.name || b.model_id);
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return addSort === "price-asc" ? a.price - b.price : b.price - a.price;
        }
        return (a.name || a.model_id).localeCompare(b.name || b.model_id);
      });
  }, [activeProvider, addSearch, addType, addSort]);

  async function saveProfile() {
    if (profileBusy) return;
    const name = fullName.trim();
    if (!name) return;
    setProfileBusy(true);
    try {
      const updated = await client.updateMe({ full_name: name, theme, language });
      onUserUpdated(updated);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileBusy(false);
    }
  }

  async function savePassword() {
    if (pwBusy) return;
    setPwError("");
    if (newPw.length < 8) {
      setPwError("Yeni şifre en az 8 karakter olmalı.");
      return;
    }
    setPwBusy(true);
    try {
      await client.changePassword(currentPw, newPw);
      setPwSaved(true);
      setCurrentPw("");
      setNewPw("");
      window.setTimeout(() => setPwSaved(false), 2000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setPwBusy(false);
    }
  }

  function startProviderEdit(cfg: UserProviderConfig) {
    setProviderEditingId(cfg.id);
    setPName(cfg.name);
    setPServer(cfg.server_url || "");
    setPKey("");
    setPModel(cfg.model_id || "");
  }

  function startProviderCreate() {
    setProviderEditingId("new");
    setPName("");
    setPServer("");
    setPKey("");
    setPModel("");
    setPCatalogSel("");
    setProviderCatalogLoading(true);
    client
      .providerCatalog()
      .then(setProviderCatalog)
      .catch(() => setProviderCatalog([]))
      .finally(() => setProviderCatalogLoading(false));
  }

  function cancelProviderEdit() {
    setProviderEditingId(null);
    setPName("");
    setPServer("");
    setPKey("");
    setPModel("");
  }

  async function saveProvider() {
    if (providerBusy) return;
    if (!pName.trim() || !pServer.trim() || !pModel.trim()) return;
    setProviderBusy(true);
    try {
      if (providerEditingId === "new") {
        const created = await client.saveMyProvider({
          name: pName.trim(),
          server_url: pServer.trim(),
          api_key: pKey.trim(),
          model_id: pModel.trim()
        });
        setProviders((rows) => [created, ...rows]);
      } else if (typeof providerEditingId === "number") {
        const data: Record<string, string> = {
          name: pName.trim(),
          server_url: pServer.trim(),
          model_id: pModel.trim()
        };
        if (pKey.trim()) data.api_key = pKey.trim();
        const updated = await client.updateMyProvider(providerEditingId, data);
        setProviders((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      }
      cancelProviderEdit();
    } finally {
      setProviderBusy(false);
    }
  }

  async function removeProvider() {
    if (providerBusy || confirmDeleteProviderId === null) return;
    const id = confirmDeleteProviderId;
    setProviderBusy(true);
    try {
      await client.deleteMyProvider(id);
      setProviders((rows) => rows.filter((row) => row.id !== id));
      setConfirmDeleteProviderId(null);
      if (providerEditingId === id) cancelProviderEdit();
    } finally {
      setProviderBusy(false);
    }
  }

  /* Ekleme pop up'ı: aktif provider'dan modelleri çek */
  async function syncForAdd() {
    const cfg = providers.find((p) => p.is_active) || providers[0];
    if (!cfg) return;
    setAddSyncing(true);
    setAddSyncError("");
    try {
      const updated = await client.syncMyProviderModels(cfg.id);
      replaceProvider(updated);
    } catch (err) {
      setAddSyncError(err instanceof Error ? err.message : "Modeller çekilemedi.");
    } finally {
      setAddSyncing(false);
    }
  }

  async function addActiveModel(configId: number, modelId: string, name?: string) {
    if (userModelBusy) return;
    setUserModelBusy(true);
    try {
      const updated = await client.addMyActiveModel(configId, { model_id: modelId, name });
      replaceProvider(updated);
    } finally {
      setUserModelBusy(false);
    }
  }

  async function removeActiveModel() {
    if (!confirmDeleteModel || userModelBusy) return;
    setUserModelBusy(true);
    try {
      const updated = await client.toggleMyActiveModel(confirmDeleteModel.configId, confirmDeleteModel.modelId, false);
      replaceProvider(updated);
      setConfirmDeleteModel(null);
    } finally {
      setUserModelBusy(false);
    }
  }

  async function saveRoles() {
    if (!rolePopup || userModelBusy) return;
    setUserModelBusy(true);
    try {
      const updated = await client.setMyActiveModelRoles(rolePopup.configId, rolePopup.modelId, roleDraft);
      replaceProvider(updated);
      setRolePopup(null);
    } finally {
      setUserModelBusy(false);
    }
  }

  async function addMemory() {
    if (memBusy) return;
    const content = memContent.trim();
    if (!content) return;
    setMemBusy(true);
    try {
      const created = await client.addMemory(content, memCategory);
      setMemories((rows) => [created, ...rows]);
      setMemContent("");
    } finally {
      setMemBusy(false);
    }
  }

  async function deleteMemory() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    try {
      await client.deleteMemory(id);
      setMemories((rows) => rows.filter((row) => row.id !== id));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  async function clearAll() {
    if (memBusy) return;
    setMemBusy(true);
    try {
      await client.clearMemories(memFilter || undefined);
      setMemories((rows) => (memFilter ? rows.filter((row) => row.category !== memFilter) : []));
      setConfirmClear(false);
    } finally {
      setMemBusy(false);
    }
  }

  if (!open) return null;

  const totalActiveCount = providers.reduce((sum, cfg) => sum + (cfg.active_models?.length || 0), 0);

  const sections: { key: SectionKey; label: string; icon: ReactNode; hint: string }[] = [
    { key: "profile", label: "Kullanıcı Bilgileri", icon: <UserRound size={16} />, hint: "Profil ve şifre" },
    { key: "provider", label: "Provider", icon: <Server size={16} />, hint: `${providers.length} sağlayıcı` },
    { key: "models", label: "Modeller", icon: <Cpu size={16} />, hint: `${totalActiveCount} aktif model` },
    { key: "memory", label: "Hafıza Kayıtları", icon: <BrainCircuit size={16} />, hint: `${memories.length} kayıt` }
  ];

  return (
    <div className="us-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="us-modal" role="dialog" aria-modal="true" aria-label="Ayarlar">
        <header className="us-head">
          <h2>AYARLAR</h2>
          <button className="us-close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </header>

        <div className="us-body">
          <aside className="us-side">
            {sections.map((item) => (
              <button
                key={item.key}
                className={`us-side-item ${section === item.key ? "active" : ""}`}
                onClick={() => setSection(item.key)}
              >
                <span className="us-side-icon">{item.icon}</span>
                <span className="us-side-main">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            ))}
          </aside>

          <div className="us-content">
            {section === "profile" && (
              <div className="us-pane">
                <h3>Kullanıcı Bilgileri</h3>
                <div className="us-card">
                  <label className="us-label">Ad Soyad</label>
                  <input
                    className="us-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={150}
                    placeholder="Adınız"
                  />
                  <label className="us-label">E-posta</label>
                  <input className="us-input" value={user?.email || ""} disabled readOnly />
                  <div className="us-two-col">
                    <div>
                      <label className="us-label">Tema</label>
                      <select className="us-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
                        <option value="dark">Koyu</option>
                        <option value="light">Açık</option>
                      </select>
                    </div>
                    <div>
                      <label className="us-label">Dil</label>
                      <select className="us-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option value="tr">Türkçe</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                  <button className="us-primary" onClick={() => void saveProfile()} disabled={profileBusy || !fullName.trim()}>
                    {profileBusy ? <Loader2 size={14} className="us-spin" /> : profileSaved ? <CheckCircle2 size={14} /> : <Check size={14} />}
                    {profileSaved ? "Kaydedildi" : "Kaydet"}
                  </button>
                </div>

                <div className="us-card">
                  <h4><KeyRound size={14} /> Şifre Değiştir</h4>
                  <label className="us-label">Mevcut Şifre</label>
                  <div className="us-pw">
                    <input
                      className="us-input"
                      type={pwShow ? "text" : "password"}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button type="button" className="us-pw-toggle" onClick={() => setPwShow((v) => !v)} aria-label="Göster/gizle">
                      {pwShow ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <label className="us-label">Yeni Şifre</label>
                  <input
                    className="us-input"
                    type={pwShow ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="En az 8 karakter"
                    autoComplete="new-password"
                  />
                  {pwError && <p className="us-error">{pwError}</p>}
                  <button className="us-primary" onClick={() => void savePassword()} disabled={pwBusy || !currentPw || newPw.length < 8}>
                    {pwBusy ? <Loader2 size={14} className="us-spin" /> : pwSaved ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}
                    {pwSaved ? "Şifre güncellendi" : "Şifreyi Güncelle"}
                  </button>
                </div>
              </div>
            )}

            {section === "provider" && (
              <div className="us-pane">
                <div className="us-pane-head">
                  <h3>Model Sağlayıcıların</h3>
                  {providerEditingId === null && (
                    <button className="us-primary us-compact" onClick={startProviderCreate}>
                      <Plus size={14} /> Yeni Ekle
                    </button>
                  )}
                </div>
                {providerLoading ? (
                  <p className="us-muted"><Loader2 size={14} className="us-spin" /> Yükleniyor…</p>
                ) : (
                  <>
                    {providers.length === 0 && providerEditingId === null && (
                      <p className="us-muted">Henüz provider eklemedin. "Yeni Ekle" ile başla.</p>
                    )}

                    {providerEditingId !== null && (
                      <div className="us-card">
                        <h4>{providerEditingId === "new" ? "Yeni Provider" : "Provider'ı Düzenle"}</h4>
                        {providerEditingId === "new" && (
                          <div className="us-field">
                            <label className="us-label">Provider Seç</label>
                            {providerCatalogLoading ? (
                              <p className="us-muted"><Loader2 size={14} className="us-spin" /> Katalog yükleniyor…</p>
                            ) : (
                              <select
                                className="us-input"
                                value={pCatalogSel}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setPCatalogSel(v);
                                  const entry = providerCatalog.find((c) => c.name === v);
                                  if (entry) {
                                    setPName(entry.name);
                                    setPServer(entry.manual ? "" : entry.base_url || "");
                                  }
                                }}
                              >
                                <option value="">— Sağlayıcı seçin —</option>
                                {providerCatalog.map((c) => (
                                  <option key={c.name} value={c.name}>
                                    {c.name}{c.manual ? " (elle gir)" : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                        <label className="us-label">Sağlayıcı Adı</label>
                        <input className="us-input" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Örn. Kendi OpenAI'ım" />
                        <label className="us-label">Sunucu Adresi</label>
                        <input className="us-input" value={pServer} onChange={(e) => setPServer(e.target.value)} placeholder="https://api.example.com/v1" />
                        <label className="us-label">API Key {providerEditingId !== "new" ? "(değiştirmek istemiyorsan boş bırak)" : ""}</label>
                        <input className="us-input" type="password" value={pKey} onChange={(e) => setPKey(e.target.value)} placeholder="sk-..." />
                        <label className="us-label">Model ID</label>
                        <input className="us-input" value={pModel} onChange={(e) => setPModel(e.target.value)} placeholder="gpt-4o-mini" />
                        <div className="us-actions">
                          <button className="us-primary" onClick={() => void saveProvider()} disabled={providerBusy || !pName.trim() || !pServer.trim() || !pModel.trim()}>
                            {providerBusy ? <Loader2 size={14} className="us-spin" /> : <Check size={14} />}
                            {providerEditingId === "new" ? "Kaydet" : "Güncelle"}
                          </button>
                          <button className="us-ghost" onClick={cancelProviderEdit} disabled={providerBusy}>Vazgeç</button>
                        </div>
                        <p className="us-hint">Ücretli paketteyken kendi provider'ınızı kullanamazsınız.</p>
                      </div>
                    )}

                    {providers.length > 0 && (
                      <div className="us-model-list">
                        {providers.map((cfg) => (
                          <div key={cfg.id} className={`us-model ${providerEditingId === cfg.id ? "editing" : ""}`}>
                            <div className="us-model-main">
                              <strong>{cfg.name}</strong>
                              <small>
                                {cfg.server_url} · {Object.keys(cfg.auto_fetched_models || {}).length} model çekildi · API key {cfg.api_key ? "tanımlı" : "yok"}
                              </small>
                              {(cfg.active_models || []).length > 0 && (
                                <div className="us-model-active">
                                  {(cfg.active_models || []).map((mid) => {
                                    const info = (cfg.auto_fetched_models || {})[mid];
                                    return (
                                      <span key={mid} className="us-addpop-tag us-addpop-tag-chat" title={mid}>
                                        {(info?.name || mid.split("/").pop() || mid).length > 22 ? (info?.name || mid.split("/").pop() || mid).slice(0, 22) + "…" : info?.name || mid.split("/").pop() || mid}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="us-model-roles">
                              <span className={`us-role ${cfg.is_active ? "memory" : "none"}`}>{cfg.is_active ? "Aktif" : "Pasif"}</span>
                              {providerEditingId === null && (
                                <>
                                  <button className="us-mem-del" onClick={() => startProviderEdit(cfg)} aria-label="Düzenle" title="Düzenle">
                                    <Pencil size={13} />
                                  </button>
                                  <button className="us-mem-del" onClick={() => setConfirmDeleteProviderId(cfg.id)} aria-label="Sil" title="Sil">
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {section === "models" && (
              <div className="us-pane">
                <div className="us-models-topbar">
                  <h3>Modeller</h3>
                  <button
                    className="us-primary us-compact"
                    disabled={userModelBusy || providers.length === 0}
                    onClick={() => { setAddOpen(true); setAddSearch(""); setAddSyncError(""); }}
                  >
                    <Plus size={13} /> Ekle
                  </button>
                </div>
                {providers.length === 0 ? (
                  <p className="us-muted">Önce "Provider" bölümünden bir sağlayıcı ekleyin.</p>
                ) : (() => {
                  const cfg = providers.find((p) => p.is_active) || providers[0];
                  const auto = cfg.auto_fetched_models || {};
                  const roleMap = cfg.model_roles || {};
                  const rows = (cfg.active_models || []).map((mid) => {
                    const info = auto[mid] as { name?: string } | undefined;
                    return { model_id: mid, name: info?.name, roles: roleMap[mid] || [] };
                  });
                  return rows.length === 0 ? (
                    <p className="us-muted us-hint">Aktif model yok — sağ üstteki "Ekle" ile provider modellerinden ekleyin.</p>
                  ) : (
                    <div className="us-acc-list">
                      {rows.map((row) => (
                        <div key={row.model_id} className="us-acc">
                          <div className="us-acc-main">
                            <strong>{row.name || row.model_id}</strong>
                            <small>{shortModelId(row.model_id)}</small>
                            <div className="us-acc-roles">
                              {row.roles.length === 0
                                ? <span className="us-role none">rol yok</span>
                                : row.roles.map((r) => (
                                    <span key={r} className={`us-role ${r}`}>{ROLE_LABELS[r] || r}</span>
                                  ))}
                            </div>
                          </div>
                          <div className="us-acc-actions">
                            <button
                              className="us-ghost us-compact"
                              disabled={userModelBusy}
                              onClick={() => { setRolePopup({ configId: cfg.id, modelId: row.model_id, name: row.name || row.model_id }); setRoleDraft([...row.roles]); }}
                              title="Rolleri ata"
                            >
                              <SlidersHorizontal size={13} /> Atama
                            </button>
                            <button
                              className="us-ghost us-compact us-danger"
                              disabled={userModelBusy}
                              onClick={() => setConfirmDeleteModel({ configId: cfg.id, modelId: row.model_id, name: row.name || row.model_id })}
                              title="Modeli listeden kaldır (sonra tekrar eklenebilir)"
                            >
                              <Trash2 size={13} /> Sil
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {section === "memory" && (
              <div className="us-pane">
                <h3>Hafıza Kayıtları</h3>
                <div className="us-card">
                  <div className="us-mem-form">
                    <select className="us-input us-select" value={memCategory} onChange={(e) => setMemCategory(e.target.value)}>
                      {MEMORY_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</option>
                      ))}
                    </select>
                    <input
                      className="us-input"
                      value={memContent}
                      onChange={(e) => setMemContent(e.target.value)}
                      placeholder="Umay'ın hatırlamasını istediğin bilgi…"
                      onKeyDown={(e) => { if (e.key === "Enter") void addMemory(); }}
                    />
                    <button className="us-primary" onClick={() => void addMemory()} disabled={memBusy || !memContent.trim()}>
                      {memBusy ? <Loader2 size={14} className="us-spin" /> : <Check size={14} />} Ekle
                    </button>
                  </div>
                </div>

                <div className="us-mem-tools">
                  <div className="us-mem-filters">
                    <button className={`us-chip ${memFilter === "" ? "active" : ""}`} onClick={() => setMemFilter("")}>Tümü</button>
                    {MEMORY_CATEGORIES.map((cat) => (
                      <button key={cat} className={`us-chip ${memFilter === cat ? "active" : ""}`} onClick={() => setMemFilter(cat)}>
                        {CATEGORY_LABELS[cat] || cat}
                      </button>
                    ))}
                  </div>
                  <button className="us-danger" onClick={() => setConfirmClear(true)} disabled={memories.length === 0}>
                    <Trash2 size={13} /> Tümünü Temizle
                  </button>
                </div>

                {memLoading ? (
                  <p className="us-muted"><Loader2 size={14} className="us-spin" /> Yükleniyor…</p>
                ) : filteredMemories.length === 0 ? (
                  <p className="us-muted">Kayıt yok. Yukarıdan ekleyebilirsin.</p>
                ) : (
                  <div className="us-mem-list">
                    {filteredMemories.map((mem) => (
                      <div key={mem.id} className="us-mem">
                        <span className="us-mem-cat">{CATEGORY_LABELS[mem.category] || mem.category}</span>
                        <p>{mem.content}</p>
                        <button className="us-mem-del" onClick={() => setConfirmDeleteId(mem.id)} aria-label="Sil"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Model ekleme pop up'ı — aktif provider'daki modeller, Ekle ile aktif listeye */}
        {addOpen && createPortal(
          <div className="us-addpop-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false); }}>
            <div className="us-addpop" role="dialog" aria-modal="true" aria-label="Model ekle">
              <header className="us-addpop-head">
                <h3>Model Ekle</h3>
                <button className="us-close" onClick={() => setAddOpen(false)} aria-label="Kapat"><X size={16} /></button>
              </header>
              <div className="us-addpop-toolbar">
                <div className="us-addpop-search">
                  <Search size={14} />
                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Model ara…"
                    autoFocus
                  />
                </div>
                <button
                  className="us-ghost us-compact"
                  disabled={addSyncing || userModelBusy || providers.length === 0}
                  onClick={() => void syncForAdd()}
                  title="Aktif provider'dan modelleri çek"
                >
                  <RefreshCw size={13} className={addSyncing ? "us-spin" : ""} /> Modelleri Çek
                </button>
              </div>
              {addSyncError && <p className="us-error">{addSyncError}</p>}
              <div className="us-addpop-filters">
                <select className="us-addpop-filter" value={addType} onChange={(e) => setAddType(e.target.value)} aria-label="Model tipi filtresi">
                  {MODEL_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select className="us-addpop-filter" value={addSort} onChange={(e) => setAddSort(e.target.value)} aria-label="Sıralama">
                  {MODEL_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {addPool.length === 0 ? (
                <p className="us-muted">
                  {addSearch
                    ? "Aramayla eşleşen model yok."
                    : "Listelenecek model yok — \"Modelleri Çek\" ile aktif provider'ın modellerini getirin."}
                </p>
              ) : (
                <div className="us-addpop-list">
                  {addPool.map((info) => (
                    <div key={info.model_id} className="us-addpop-row">
                      <div className="us-addpop-main">
                        <strong>{info.name || info.model_id}</strong>
                        <small>{shortModelId(info.model_id)}</small>
                        <div className="us-addpop-tags">
                          <span className={`us-addpop-tag us-addpop-tag-${info.type === "sohbet" ? "chat" : info.type === "embedding" ? "embed" : "other"}`}>{info.type}</span>
                          {info.priceText ? <span className="us-addpop-tag us-addpop-tag-price">{info.priceText}</span> : null}
                        </div>
                      </div>
                      <button
                        className="us-ghost us-compact"
                        disabled={userModelBusy}
                        onClick={() => void addActiveModel(activeProviderId, info.model_id, info.name)}
                        title="Modeli aktif listeye ekle"
                      >
                        <Plus size={13} /> Ekle</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        , document.body)}

        {/* Rol atama pop up'ı */}
        {rolePopup && createPortal(
          <div className="us-addpop-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setRolePopup(null); }}>
            <div className="us-addpop us-addpop-roles" role="dialog" aria-modal="true" aria-label="Rol atama">
              <header className="us-addpop-head">
                <h3>Rol Atama</h3>
                <button className="us-close" onClick={() => setRolePopup(null)} aria-label="Kapat"><X size={16} /></button>
              </header>
              <p className="us-addpop-model">{rolePopup.name}</p>
              <div className="us-checkbox-row">
                {ROLE_KEYS.map((r) => (
                  <label key={r} className="us-checkbox">
                    <input
                      type="checkbox"
                      checked={roleDraft.includes(r)}
                      onChange={(e) =>
                        setRoleDraft((prev) =>
                          e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)
                        )
                      }
                    />
                    {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
              <div className="us-row">
                <button className="us-primary us-compact" disabled={userModelBusy} onClick={() => void saveRoles()}>
                  {userModelBusy ? <Loader2 size={13} className="us-spin" /> : <Check size={13} />} Kaydet
                </button>
                <button className="us-ghost us-compact" onClick={() => setRolePopup(null)} disabled={userModelBusy}>Vazgeç</button>
              </div>
            </div>
          </div>
        , document.body)}

        {/* Silme onayları */}
        {(confirmClear || confirmDeleteId !== null || confirmDeleteProviderId !== null || confirmDeleteModel !== null) && createPortal(
          <div className="us-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setConfirmClear(false); setConfirmDeleteId(null); setConfirmDeleteProviderId(null); setConfirmDeleteModel(null); } }}>
            <div className="us-confirm" role="alertdialog" aria-modal="true">
              <span className="us-confirm-icon"><Trash2 size={20} /></span>
              <h3>
                {confirmDeleteModel !== null
                  ? "Model silinsin mi?"
                  : confirmDeleteProviderId !== null
                    ? "Provider silinsin mi?"
                    : confirmDeleteId !== null
                      ? "Kayıt silinsin mi?"
                      : "Tüm hafıza kayıtları silinsin mi?"}
              </h3>
              <p>
                {confirmDeleteModel !== null
                  ? `"${confirmDeleteModel.name}" aktif modellerden kaldırılacak; daha sonra tekrar eklenebilir.`
                  : confirmDeleteProviderId !== null
                    ? "Bu provider yapılandırması kalıcı olarak silinecek."
                    : confirmDeleteId !== null
                      ? "Bu hafıza kaydı kalıcı olarak silinecek."
                      : "Bu işlem geri alınamaz."}
              </p>
              <div className="us-confirm-actions">
                <button className="us-confirm-cancel" onClick={() => { setConfirmClear(false); setConfirmDeleteId(null); setConfirmDeleteProviderId(null); setConfirmDeleteModel(null); }} disabled={memBusy || providerBusy || userModelBusy}>Vazgeç</button>
                <button
                  className="us-confirm-delete"
                  onClick={() => {
                    if (confirmDeleteModel !== null) void removeActiveModel();
                    else if (confirmDeleteProviderId !== null) void removeProvider();
                    else if (confirmDeleteId !== null) void deleteMemory();
                    else void clearAll();
                  }}
                  disabled={memBusy || providerBusy || userModelBusy}
                >
                  {memBusy || providerBusy || userModelBusy ? <Loader2 size={14} className="us-spin" /> : <Trash2 size={14} />}
                  {memBusy || providerBusy || userModelBusy ? "Siliniyor…" : "Sil"}
                </button>
              </div>
            </div>
          </div>
        , document.body)}
      </section>
    </div>
  );
}

function shortModelId(modelId: string) {
  return modelId.split("/").pop() || modelId;
}

/* Ekleme pop up'ı için tip/fiyat türetme — OpenAI uyumlu metadata alanlarına dayanır */
type PoolEntry = { model_id: string; name?: string; metadata?: Record<string, unknown> | null; type: string; price: number | null; priceText: string };

function modelTypeOf(info: { model_id: string; metadata?: Record<string, unknown> | null }): string {
  const meta = info.metadata || {};
  const hay = [
    typeof meta.type === "string" ? meta.type : "",
    typeof meta.modality === "string" ? meta.modality : "",
    typeof meta.architecture === "object" && meta.architecture !== null ? JSON.stringify(meta.architecture) : "",
    info.model_id.toLowerCase(),
  ].join(" ");
  if (hay.includes("embed")) return "embedding";
  if (hay.includes("rerank")) return "rerank";
  if (hay.includes("whisper") || hay.includes("tts") || hay.includes("audio")) return "audio";
  if (hay.includes("dall") || hay.includes("image") || hay.includes("flux") || hay.includes("stable-diffusion")) return "görüntü";
  if (hay.includes("moderation")) return "moderation";
  return "sohbet";
}

function modelPriceOf(info: { metadata?: Record<string, unknown> | null }): number | null {
  const meta = (info.metadata || {}) as Record<string, unknown>;
  const nested = (key: string): Record<string, unknown> =>
    typeof meta[key] === "object" && meta[key] !== null ? (meta[key] as Record<string, unknown>) : {};
  const pricing = nested("pricing");
  const inP = meta.input_price ?? pricing.prompt ?? pricing.input;
  const outP = meta.output_price ?? pricing.completion ?? pricing.output;
  if (typeof inP === "number" && typeof outP === "number") return inP + outP;
  if (typeof inP === "number") return inP;
  if (typeof outP === "number") return outP;
  return null;
}

function formatModelPrice(price: number): string {
  if (price === 0) return "ücretsiz";
  if (price < 0.000001) return "~0";
  return price < 0.01 ? price.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : price.toFixed(2);
}
