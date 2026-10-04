// Umay web — demo (fallback) verileri.
// Canlı API verisi geldiğinde paneller buradaki değerlerle dolar.

export type SystemMetric = {
  key: string;
  label: string;
  percent: number;
  detail: string;
  icon: "cpu" | "ram" | "gpu" | "disk" | "temp";
};

export const demoSystem: SystemMetric[] = [
  { key: "cpu", label: "CPU", percent: 24, detail: "2.4 / 10.0 GHz", icon: "cpu" },
  { key: "ram", label: "RAM", percent: 41, detail: "6.5 / 16 GB", icon: "ram" },
  { key: "gpu", label: "GPU", percent: 8, detail: "0.6 / 8 GB", icon: "gpu" },
  { key: "disk", label: "DISK", percent: 32, detail: "152 / 476 GB", icon: "disk" }
];

export const demoServices = [
  { name: "LLM Servisi", state: "aktif", icon: "bot" },
  { name: "Arama Servisi", state: "aktif", icon: "search" },
  { name: "Tarayıcı Servisi", state: "aktif", icon: "globe" },
  { name: "Veritabanı", state: "aktif", icon: "database" },
  { name: "Ses (STT/TTS)", state: "aktif", icon: "mic" },
  { name: "Güvenlik", state: "aktif", icon: "shield" },
  { name: "Planlayıcı", state: "aktif", icon: "calendar" },
  { name: "Bildirim Servisi", state: "aktif", icon: "bell" }
];

export type AgentNode = {
  name: string;
  desc: string;
  icon: "search" | "memory" | "code" | "browser" | "calendar" | "shield" | "wand" | "system";
  pos: string;
  color: string;
};

/** umay.png'deki 8 ajan düğümü */
export const demoAgentNodes: AgentNode[] = [
  { name: "Planlama Ajanı", desc: "Görevleri analiz eder", icon: "calendar", pos: "node-planlama", color: "#38bdf8" },
  { name: "Doğrulama Ajanı", desc: "Cevapları kontrol eder", icon: "shield", pos: "node-dogrulama", color: "#fb7185" },
  { name: "Arama Ajanı", desc: "İnternette araştırır", icon: "search", pos: "node-arama", color: "#34d399" },
  { name: "Hafıza Ajanı", desc: "Bilgileri hatırlar", icon: "memory", pos: "node-hafiza", color: "#a78bfa" },
  { name: "Kodlama Ajanı", desc: "Kod yazar, düzenler", icon: "code", pos: "node-kodlama", color: "#fbbf24" },
  { name: "Üretim Ajanı", desc: "İçerik oluşturur", icon: "wand", pos: "node-uretim", color: "#38bdf8" },
  { name: "Tarayıcı Ajanı", desc: "Web'de gezinir", icon: "browser", pos: "node-tarayici", color: "#22d3ee" },
  { name: "Yürütme Ajanı", desc: "Görevleri tamamlar", icon: "system", pos: "node-yurutme", color: "#34d399" }
];

/** Nokta harita üzerindeki şehirler (yüzde koordinatları) */
export const demoCities = [
  { city: "İstanbul", x: 57, y: 30 },
  { city: "New York", x: 25, y: 33 },
  { city: "Tokyo", x: 86, y: 36 },
  { city: "London", x: 48, y: 24 },
  { city: "Berlin", x: 53, y: 27 },
  { city: "Sydney", x: 89, y: 73 }
];

export const demoNews = [
  { time: "14:20", title: "Yapay zeka ile yeni dönem: Küresel şirketler yatırımlarını artırıyor", source: "Teknoloji" },
  { time: "13:55", title: "Uzay araştırmalarında önemli keşif", source: "Dünya" },
  { time: "13:40", title: "Yenilenebilir enerji projelerinde rekor artış", source: "Ekonomi" },
  { time: "12:28", title: "Türkiye'de dijital dönüşüm hamlesi", source: "Dünya" },
  { time: "11:05", title: "Kuantum bilgisayarlarda yeni yol haritası açıklandı", source: "Teknoloji" },
  { time: "09:47", title: "Uzay turizmi sezonu: Yeni görevler başlıyor", source: "Spor" }
];

export const demoNewsCategories = ["Teknoloji", "Dünya", "Ekonomi", "Spor", "Tümü"];

export const demoTasks = [
  { title: "Proje raporunu hazırla", when: "Bugün", time: "16:00", done: false },
  { title: "Toplantı notlarımı özetle", when: "Bugün", time: "17:30", done: false },
  { title: "Yeni özellikleri test et", when: "Yarın", time: "10:00", done: false },
  { title: "Ventabanı yedekle", when: "Yarın", time: "12:00", done: true }
];

export const demoActivity = [
  { time: "14:28", agent: "Arama Ajanı", note: "Teknoloji haberleri araştırılıyor...", icon: "search" },
  { time: "14:27", agent: "Doğrulama Ajanı", note: "Bulunan bilgiler kontrol ediliyor...", icon: "shield" },
  { time: "14:26", agent: "Planlama Ajanı", note: "Yeni görev planı oluşturuldu.", icon: "calendar" },
  { time: "14:25", agent: "Tarayıcı Ajanı", note: "Web sayfası analiz ediliyor...", icon: "browser" },
  { time: "14:24", agent: "Kodlama Ajanı", note: "main.py düzenlendi.", icon: "code" },
  { time: "14:23", agent: "Üretim Ajanı", note: "Görsel oluşturuldu.", icon: "wand" },
  { time: "14:22", agent: "Hafıza Ajanı", note: "Bilgi veritabanına kaydedildi.", icon: "memory" },
  { time: "14:21", agent: "Sistem", note: "Tüm ajanlar senkronize edildi.", icon: "system" }
];

export const demoQuickAccess = [
  { label: "Dosyalar", icon: "folder" },
  { label: "E-Posta", icon: "mail" },
  { label: "Takvim", icon: "calendar" },
  { label: "Notlar", icon: "file" },
  { label: "Tarayıcı", icon: "browser" },
  { label: "Üret", icon: "wand" },
  { label: "Çevir", icon: "lang" },
  { label: "Hesap Mak.", icon: "calc" }
];

export const demoRealtime = {
  apiRequests: "1.284",
  apiUnit: "/ saat",
  tokenUsage: "48.2K",
  tokenUnit: "/ saat",
  latency: "1.2 sn",
  model: "Gemini 3.7 Flash",
  netUp: "19 Mbps",
  netDown: "32 Mbps"
};
