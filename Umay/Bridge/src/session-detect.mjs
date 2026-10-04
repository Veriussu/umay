/**
 * Oturum tipi tespiti — X11 mi Wayland mi?
 *
 * NEDEN BU DOSYA VAR (Faz 1, 2026-10-04)
 *
 * ÖLÇÜM: eski `native-runtime.mjs` içinde `wayland` kelimesi SIFIR kez
 * geçiyordu. Linux için adaptör seçimi koşulsuzdu:
 *
 *     if (currentPlatform === "linux" && commandAvailable("xdotool"))
 *       return { name: "xdotool", ... };
 *
 * Sonuç: bir KDE Neon veya Fedora Wayland oturumunda fare/klavye
 * komutları `xdotool`'a gider. `xdotool` X11'e BAĞLIDIR; Wayland
 * oturumunda ya hata verir ya da UYARI BASILMAZ.
 *
 * "Uyarı basılmaz" en tehlikeli hâli: Bridge `available: true`
 * bildirir, komut gönderilir, hiçbir şey olmaz, Umay "tıkladım"
 * sanır. Bu, 2026-09-30'da tespit edilen uydurma sınıfının donanım
 * tarafındaki karşılığıdır.
 *
 * TESPİT YÖNTEMİ
 *
 *   1. `XDG_SESSION_TYPE` ortam değişkeni (dolandırılabilir ama
 *      systemd tarafından güvenilir biçimde ayarlanır)
 *   2. `WAYLAND_DISPLAY` mevcut mu (soket adresi)
 *   3. `DISPLAY` mevcut mu (X11)
 *   4. Hiçbiri yoksa bilinmiyor -> TUTUMLU davranış
 *
 * TUTUMLU DAVRANIŞ (kritik)
 *
 * Emin olunamıyorsa Wayland varsayılır ve yalnızca Wayland
 * adaptörleri kullanılır. Neden: X11 istemcisi Wayland oturumunda
 * sessizce başarısız olur; Wayland istemcisi (portal) en kötü
 * "izin yok" der. Kullanıcı bir hata mesajı alabiliyorsa doğru
 * yönlendirilebilir; sessiz başarısızlık alınamaz.
 */

import { existsSync } from "node:fs";
import { platform } from "node:os";

/** Bilinen oturum tipleri. */
export const SESSION_UNKNOWN = "unknown";
export const SESSION_X11 = "x11";
export const SESSION_WAYLAND = "wayland";

/**
 * Mevcut oturum tipini belirle.
 *
 * @param {object} [deps] - test için enjekte edilebilir bağımlılıklar
 * @param {NodeJS.ProcessEnv} [deps.env]
 * @param {boolean} [deps.existsSync] - soket kontrolü
 * @returns {"x11"|"wayland"|"unknown"}
 */
export function detectSessionType({
  env = process.env,
  existsSync: pathExists = existsSync,
} = {}) {
  // Linux dışında oturum tipi ilgisiz: macOS her zaman Quartz,
  // Windows her zaman Win32. Yine de yanlış varsayılan olmasın.
  if (platform() !== "linux" && env.PLATFORM_OVERRIDE !== "linux") {
    return SESSION_UNKNOWN;
  }

  const declared = String(env.XDG_SESSION_TYPE || "").trim().toLowerCase();
  if (declared === "x11") return SESSION_X11;
  if (declared === "wayland") return SESSION_WAYLAND;

  // systemd bazen `tty`/`mir` gibi yazıyor; o zaman sokete bak.
  const waylandSocket = env.WAYLAND_DISPLAY;
  if (waylandSocket) {
    // `WAYLAND_DISPLAY=wayland-0` göreli yoldur; mutlak da olabilir.
    const candidate = waylandSocket.includes("/")
      ? waylandSocket
      : `/run/user/${env.XDG_RUNTIME_DIR?.split("/").pop() || "0"}/${waylandSocket}`;
    if (pathExists(candidate)) return SESSION_WAYLAND;
    // Soket dosyası görünmüyorsa da WAYLAND_DISPLAY tanımlıysa
    // Wayland kabul edilir: bazı sistemler soketi gizler.
    return SESSION_WAYLAND;
  }

  const display = env.DISPLAY;
  if (display) return SESSION_X11;

  // Hiçbiri yok: konsol/kapalı oturum.
  return SESSION_UNKNOWN;
}

/**
 * Oturum tipine göre hangi aileyi tercih etmeliyiz?
 *
 * @param {string} sessionType
 * @returns {"wayland"|"x11"}
 */
export function preferredDisplayServer(sessionType) {
  // Wayland oturumunda X11 aracı sessizce başarısız olur; tersi
  // (Wayland aracı X11'de) en kötü "izin yok" der. Bu yüzden
  // belirsizlikte Wayland tercih edilir.
  return sessionType === SESSION_X11 ? SESSION_X11 : SESSION_WAYLAND;
}

/**
 * Linux'ta fare/klavye/ekran için uygun komut sırası.
 *
 * DİZİ DİZİ SIRALI DENENİR — ilk bulunan kullanılır. Sıralama
 * "en güvenilirden en deneysele" doğru yazıldı.
 *
 * @param {string} sessionType
 * @param {string} kind - "mouse" | "keyboard" | "screen" | "clipboard"
 * @returns {string[]}
 */
export function linuxAdapterCandidates(sessionType, kind) {
  const wayland = preferredDisplayServer(sessionType) === SESSION_WAYLAND;

  if (kind === "mouse" || kind === "keyboard") {
    // HER İKİ AİLEDEN ARAÇ LİSTESİ
    //
    // ÖLÇÜM (2026-10-04): ilk sürümde X11 listesine yalnız
    // `["xdotool", "ydotool", "dotool"]` yazılmıştı. Sonuç: X11
    // oturumunda yalnız `wtype` kuruluysa kontrol YANLIŞ kapanıyordu
    // ("no_input_adapter") — oysa klavye kontrolü çalışabilirdi.
    //
    // `wtype` aslında Wayland aracıdır ama Xwayland üzerinde de
    // çalışabilir; bu yüzden X11 listesinde de YEDEK olarak durur.
    // Doğru davranış: oturumun tercih edilen ailesi önce, diğeri
    // yedek olarak denenir.
    return wayland
      ? ["wtype", "dotool", "ydotool", "xdotool"]
      : ["xdotool", "ydotool", "dotool", "wtype"];
  }

  if (kind === "screen") {
    // `grim` YALNIZCA wlroots (Sway) üzerinde çalışır; GNOME'da
    // çalışmaz. GNOME için `gnome-screenshot` önce gelmeli.
    return wayland
      ? ["gnome-screenshot", "grim", "spectacle", "scrot", "import"]
      : ["scrot", "import", "gnome-screenshot", "grim"];
  }

  if (kind === "clipboard") {
    return wayland
      ? ["wl-copy", "cliphist", "xclip", "xsel"]
      : ["xclip", "xsel", "wl-copy"];
  }

  return [];
}

/**
 * Bu ortamda fare/klavye kontrolü MÜMKÜN mü?
 *
 * Yetenek raporu bunu kullanır. Neden önemli: "mümkün mü" sorusu
 * "hangi araç var" sorusundan FARKLIDIR. Wayland oturumunda portal
 * izni verilmemişse araçlar kurulu olsa bile kontrol yapılamaz.
 *
 * @param {string} sessionType
 * @param {(cmd: string) => boolean} commandAvailable
 * @returns {{ available: boolean, sessionType: string, family: string, candidates: string[] }}
 */
export function desktopControlAvailability(sessionType, commandAvailable) {
  const family = preferredDisplayServer(sessionType);
  const candidates = linuxAdapterCandidates(sessionType, "mouse");
  const found = candidates.filter((cmd) => commandAvailable(cmd));

  if (sessionType === SESSION_UNKNOWN) {
    return {
      available: false,
      sessionType,
      family,
      candidates,
      reason: "session_type_unknown",
      detail:
        "Masaüstü oturumu tespit edilemedi (XDG_SESSION_TYPE, " +
        "WAYLAND_DISPLAY ve DISPLAY ayarlı değil). Bridge bir " +
        "oturum içinde çalışmalıdır.",
    };
  }

  if (found.length === 0) {
    return {
      available: false,
      sessionType,
      family,
      candidates,
      reason: "no_input_adapter",
      detail:
        `${family} oturumunda fare/klavye aracı bulunamadı. ` +
        `Aranan: ${candidates.join(", ")}.`,
    };
  }

  // X11'de xdotool, Wayland'de wtype bulunduysa sessiz çalışmayı
  // bekleriz. Bulunamadıysa zaten `available: false` yukarıda.
  return {
    available: true,
    sessionType,
    family,
    candidates,
    adapter: found[0],
  };
}