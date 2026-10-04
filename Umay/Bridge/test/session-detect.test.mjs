/**
 * Oturum tipi tespiti — testler.
 *
 * Bu dosya, Faz 1'in ilk ölçülen açığını kapatır: `native-runtime.mjs`
 * içinde "wayland" kelimesi SIFIR kez geçiyordu ve Linux için adaptör
 * seçimi koşulsuzdu. Wayland oturumunda Bridge `available: true`
 * bildirip `xdotool`'a komut gönderiyor, komut sessizce başarısız
 * oluyordu.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_UNKNOWN,
  SESSION_WAYLAND,
  SESSION_X11,
  desktopControlAvailability,
  detectSessionType,
  linuxAdapterCandidates,
  preferredDisplayServer,
} from "../src/session-detect.mjs";

const alwaysExists = () => true;
const nothingExists = () => false;

test("XDG_SESSION_TYPE x11 deyince X11 tespit edilir", () => {
  const t = detectSessionType({
    env: { XDG_SESSION_TYPE: "x11", PLATFORM_OVERRIDE: "linux" },
    existsSync: alwaysExists,
  });
  assert.equal(t, SESSION_X11);
});

test("XDG_SESSION_TYPE wayland deyince Wayland tespit edilir", () => {
  const t = detectSessionType({
    env: { XDG_SESSION_TYPE: "wayland", PLATFORM_OVERRIDE: "linux" },
    existsSync: alwaysExists,
  });
  assert.equal(t, SESSION_WAYLAND);
});

test("XDG_SESSION_TYPE yazmasa WAYLAND_DISPLAY varsa Wayland sayilir", () => {
  const t = detectSessionType({
    env: {
      WAYLAND_DISPLAY: "wayland-0",
      XDG_RUNTIME_DIR: "/run/user/1000",
      DISPLAY: ":0",
      PLATFORM_OVERRIDE: "linux",
    },
    existsSync: alwaysExists,
  });
  // İKİSİ DE tanımlıysa Wayland kazanır: modern masaüstlerin
  // varsayılanı ve X11 köprüsü sessiz başarısızlık üretir.
  assert.equal(t, SESSION_WAYLAND);
});

test("sadece DISPLAY varsa X11 sayilir", () => {
  const t = detectSessionType({
    env: { DISPLAY: ":0", PLATFORM_OVERRIDE: "linux" },
    existsSync: alwaysExists,
  });
  assert.equal(t, SESSION_X11);
});

test("hicbir sey yoksa bilinmiyor", () => {
  const t = detectSessionType({
    env: { PLATFORM_OVERRIDE: "linux" },
    existsSync: nothingExists,
  });
  assert.equal(t, SESSION_UNKNOWN);
});

test("mutlak WAYLAND_DISPLAY yolu taninir", () => {
  let seen = null;
  const t = detectSessionType({
    env: {
      WAYLAND_DISPLAY: "/custom/wayland.sock",
      PLATFORM_OVERRIDE: "linux",
    },
    existsSync: (p) => {
      seen = p;
      return true;
    },
  });
  assert.equal(t, SESSION_WAYLAND);
  assert.equal(seen, "/custom/wayland.sock");
});

test("belirsizlikte Wayland tercih edilir (guvenli varsayilan)", () => {
  // X11 istemcisi Wayland'de sessizce basarisiz olur;
  // Wayland istemcisi X11'de en kotu "izin yok" der.
  assert.equal(preferredDisplayServer(SESSION_UNKNOWN), SESSION_WAYLAND);
  assert.equal(preferredDisplayServer(SESSION_WAYLAND), SESSION_WAYLAND);
  assert.equal(preferredDisplayServer(SESSION_X11), SESSION_X11);
});

test("Wayland oturumunda xdotool sona birakilir", () => {
  const candidates = linuxAdapterCandidates(SESSION_WAYLAND, "mouse");
  assert.equal(candidates[0], "wtype");
  assert.ok(candidates.indexOf("wtype") < candidates.indexOf("xdotool"));
});

test("X11 oturumunda xdotool one cikar", () => {
  const candidates = linuxAdapterCandidates(SESSION_X11, "mouse");
  assert.equal(candidates[0], "xdotool");
});

test("GNOME'da grim one gelmez (wlroots araci)", () => {
  // grim yalnizca wlroots (Sway) uzerinde calisir; GNOME'da
  // calismaz. GNOME kullaniciya gorsel ekran alabilir ama
  // fare/klavye icin portal gerekir.
  const candidates = linuxAdapterCandidates(SESSION_WAYLAND, "screen");
  assert.equal(candidates[0], "gnome-screenshot");
});

test("oturum bilinmiyorsa kontrol YAPILAMAZ", () => {
  const r = desktopControlAvailability(SESSION_UNKNOWN, () => true);
  assert.equal(r.available, false);
  assert.equal(r.reason, "session_type_unknown");
});

test("arac yoksa sessizce basarili BILDIRILMEZ", () => {
  // EN TEHLIKELI HALE: arac yokken "available: true" demek,
  // Umay'in "tkladim" sanmasina yol acar.
  const r = desktopControlAvailability(SESSION_X11, () => false);
  assert.equal(r.available, false);
  assert.equal(r.reason, "no_input_adapter");
});

test("arac varsa hangi adapter secildi bildirilir", () => {
  const r = desktopControlAvailability(
    SESSION_X11,
    (cmd) => cmd === "xdotool",
  );
  assert.equal(r.available, true);
  assert.equal(r.adapter, "xdotool");
});

test("Wayland oturumunda wtype varsa o secilir, xdotool degil", () => {
  const r = desktopControlAvailability(
    SESSION_WAYLAND,
    (cmd) => cmd === "wtype" || cmd === "xdotool",
  );
  assert.equal(r.available, true);
  assert.equal(r.adapter, "wtype", "Wayland'da xdotool tercih edilmemeli");
});

test("sadece xdotool kuruluysa Wayland'da guvenli sekilde bildirilir", () => {
  // Xwayland bazi kurulumlarda calistirir ama bu garanti degildir.
  // Bulundugunde adapter olarak xdotool bildirilir; yoksa "yok".
  const varOlan = desktopControlAvailability(
    SESSION_WAYLAND,
    (cmd) => cmd === "xdotool",
  );
  assert.equal(varOlan.available, true, "bulunduysa kullanilabilir sayilir");

  const yokOlan = desktopControlAvailability(SESSION_WAYLAND, () => false);
  assert.equal(yokOlan.available, false);
});