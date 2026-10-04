/// <reference types="vite/client" />

/**
 * Umay masaüstü köprüsü — tip tanımları.
 *
 * `window.umay` yalnız Electron ana sürecindeki `preload.cjs` tarafından
 * tanımlanır. Tarayıcıda `undefined` olur; arayüz normal web modunda
 * çalışır (sohbet, hafıza, arama sunucudan gelir) ama OS'a dokunamaz.
 *
 * Bu dosya `declare global` kullandığı için bir MODÜL olmalıdır
 * (export içermelidir); aksi halde TypeScript global bildirimi
 * tanımaz ve `window.umay` hatası verir.
 */

export interface UmayDesktopBridge {
  masaustu: true;
  yetenekler(): Promise<{
    platform: string;
    session?: { type: string; display_server?: string; reason?: string | null };
    actions: Record<string, { available: boolean; adapter?: string; reason?: string }>;
  }>;
  ekran(): Promise<Record<string, unknown>>;
  tikla(x: number, y: number): Promise<Record<string, unknown>>;
  yaz(metin: string): Promise<Record<string, unknown>>;
  terminal(komut: string[]): Promise<Record<string, unknown>>;
  panoya(metin: string): Promise<Record<string, unknown>>;
  ayarlarOku(): Promise<Record<string, unknown>>;
  ayarlarYaz(ayarlar: Record<string, unknown>): Promise<boolean>;
}

declare global {
  interface Window {
    umay?: UmayDesktopBridge;
  }
}

export {};