/**
 * Umay masaüstü köprüsü — tek giriş noktası.
 *
 * NEDEN AYRI DOSYA
 *
 * Arayüz iki ortamda çalışır:
 *   1. Tarayıcı (web): sunucuya bağlanır, sohbet/hafıza çalışır,
 *      ama OS'a dokunamaz.
 *   2. Masaüstü uygulaması (Electron): `window.umay` vardır ve
 *      ekran/fare/klavye/terminal kullanılabilir.
 *
 * Bu dosya arayüzün hangi ortamda olduğunu SORAN tek yerdir. Böylece
 * `window.umay` kontrolü her bileşende tekrarlanmaz ve "tarayıcıda
 * var mı" belirsizliği ortadan kalkar.
 *
 * TASARIM KARARI
 *
 * OS komutları her zaman `window.umay` üzerinden ana sürece gider.
 * Arayüz (renderer) Node'a erişemez; ana süreç OS'a dokunan tek
 * yerdir. Bu, "arayüz kodu istediğini çalıştırsın" riskini kapatır.
 */

export type YetenekRaporu = {
  platform: string;
  session?: { type: string; display_server?: string; reason?: string | null };
  actions: Record<string, { available: boolean; adapter?: string; reason?: string }>;
};

export type IslemSonucu = {
  ok: boolean;
  [anahtar: string]: unknown;
};

/** Masaüstü uygulamasında mıyız? */
export function masaustuMu(): boolean {
  return typeof window !== "undefined" && Boolean(window.umay?.masaustu);
}

/** Bu makinede ne yapılabiliyor? Tarayıcıda null döner. */
export async function yetenekleriOku(): Promise<YetenekRaporu | null> {
  if (!masaustuMu()) return null;
  try {
    return (await window.umay!.yetenekler()) as YetenekRaporu;
  } catch {
    return null;
  }
}

/** Tek bir yetenek var mı? */
export function yetenekVar(rapor: YetenekRaporu | null, ad: string): boolean {
  if (!rapor) return false;
  return Boolean(rapor.actions?.[ad]?.available);
}

/** Ekran görüntüsü al. Masaüstü uygulamasında çalışır. */
export async function ekranAl(): Promise<IslemSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.ekran()) as IslemSonucu;
}

/** Koordinata tıkla. */
export async function tikla(x: number, y: number): Promise<IslemSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.tikla(x, y)) as IslemSonucu;
}

/** Klavyeyle metin yaz. */
export async function yaz(metin: string): Promise<IslemSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.yaz(metin)) as IslemSonucu;
}

/** Terminal komutu çalıştır (argv dizisi — shell DEĞİL). */
export async function terminalCalistir(komut: string[]): Promise<IslemSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.terminal(komut)) as IslemSonucu;
}

/** Panoya kopyala. */
export async function panoyaKopyala(metin: string): Promise<IslemSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.panoya(metin)) as IslemSonucu;
}

/** Backend bağlantı ayarları (~/.umay/ayarlar.json). */
export async function ayarlariOku(): Promise<Record<string, unknown>> {
  if (!masaustuMu()) return {};
  try {
    return (await window.umay!.ayarlarOku()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function ayarlariYaz(ayarlar: Record<string, unknown>): Promise<boolean> {
  if (!masaustuMu()) return false;
  try {
    return await window.umay!.ayarlarYaz(ayarlar);
  } catch {
    return false;
  }
}

/** Tarayıcıda çalışırken kullanıcıya gösterilecek açıklama. */
export const TARAYICI_UYARISI =
  "Bu özellik masaüstü uygulamasında çalışır. Tarayıcıdan yalnızca sohbet, " +
  "hafıza ve arama özelliklerini kullanabilirsiniz.";

// ------------------------------------------------------------------ cihaz

/**
 * Cihaz (bilgisayar) bağlantısı.
 *
 * NEDEN VAR
 *
 * Ölçüm (2026-10-05): kullanıcı "dosya oluştur" dedi → plan oluştu,
 * planning bitti, computer görevi QUEUED kaldı. Nedeni:
 *
 *   agent_devices → 0 kayıt    (cihaz eşleşmemiş)
 *   main.cjs      → 0 spawn     (Electron Bridge'ı başlatmıyor)
 *
 * Bu yüzden "Umay senin bilgisayarını kullansın" zinciri kopuktu.
 * Kanal backend'da hazırdı; masan ucu yoktu.
 *
 * AKIŞ
 *
 *   Giriş yap → token al → Bridge'ı başlat → cihaz eşleşir →
 *   backend artık bu bilgisayara komut gönderebilir
 *
 * Token YALNIZCA burada, eşleştirme anında kullanılır. Durum
 * sorgusunda token DÖNMEZ.
 */

export type CihazDurumu = {
  kurulu: boolean;
  calisiyor: boolean;
  deviceId: number | null;
  cihazAdi: string | null;
  platform: string | null;
  eşlesTarih?: string | null;
  sonKomut?: string | null;
  sonHata?: string[];
};

export type BaglatmaSonucu = {
  basarili: boolean;
  neden?: string;
  mesaj?: string;
  stdout?: string;
  stderr?: string;
  hata?: string | null;
  durum?: CihazDurumu;
  gunluk?: string[];
  /** Bağlantı neden kurulamadıysa son günlük satırları (token içermez). */
  sonHata?: string[];
};

/** Cihazın backend'e eşleşip eşleşmediğini oku. */
export async function cihazDurumuOku(): Promise<CihazDurumu | null> {
  if (!masaustuMu()) return null;
  try {
    return (await window.umay!.bridgeDurum()) as CihazDurumu;
  } catch {
    return null;
  }
}

/**
 * Cihazı backend'e eşleştir ve komut kanalını aç.
 *
 * Token'lar `api.ts`'teki `localStorage`'dan gelir; giriş yapılmamışsa
 * bu çağrı yapılmamalı.
 */
export async function cihazBaglat(access: string | null, refresh: string | null): Promise<BaglatmaSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.bridgeBaslat(access, refresh)) as BaglatmaSonucu;
}

/** Cihaz bağlantısını kapat. */
export async function cihazBaglantiKapat(): Promise<BaglatmaSonucu | null> {
  if (!masaustuMu()) return null;
  return (await window.umay!.bridgeDurdur()) as BaglatmaSonucu;
}