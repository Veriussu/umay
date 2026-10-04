/**
 * Umay — Electron ana süreci
 *
 * NEDEN BURADA
 *
 * Backend sunucuda SABİT kalır: ajan kodları, model çağrıları, API
 * anahtarları, kullanıcı verisi, paketler. Bunların hiçbiri
 * kullanıcının makinesine inmez.
 *
 * Bu dosya kullanıcının makinesinde OS'a dokunan TEK yer. Bridge'in
 * `native-runtime.mjs` kodunu olduğu gibi kullanır; yeniden yazım
 * yok. Bridge Node.js üzerinde çalışıyor, Electron da Node.js
 * üzerinde — ikisi aynı runtime.
 *
 * GÜVENLİK
 *
 *  - `nodeIntegration: false` — arayüzün (renderer) Node'a erişimi yok
 *  - `contextIsolation: true` — arayüzden ana sürece köprü `preload`
 *  - `allowRunningInsecureContent` yok
 *  - Uzak içerik yüklenmez (CSP)
 *  - OS komutları SADECE ana süreçte; arayüz "şunu yap" derse ana
 *    süreç yapar
 */

"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Bridge'in native runtime'ı — mevcut kod, değiştirilmedi.
const bridgeDir = path.join(__dirname, "..", "..", "Bridge", "src");

let nativeRuntime = null;
let nativeLoadError = null;
try {
  nativeRuntime = require(path.join(bridgeDir, "native-runtime.mjs"));
} catch (err) {
  // Electron CommonJS'de ESM yükleyemez; dinamik import kullanılır.
  nativeLoadError = String(err && err.message ? err.message : err);
}

let nativeModulePromise = null;

/** Bridge native runtime'ını ESM olarak yükle. */
async function loadNative() {
  if (nativeRuntime) return nativeRuntime;
  if (nativeLoadError && !String(nativeLoadError).includes("require() of ES Module")) {
    throw new Error(nativeLoadError);
  }
  if (!nativeModulePromise) {
    nativeModulePromise = import(
      require("node:url").pathToFileURL(path.join(bridgeDir, "native-runtime.mjs")).href
    ).catch((err) => {
      nativeModulePromise = null;
      throw new Error(`Bridge native runtime yüklenemedi: ${err.message}`);
    });
  }
  nativeRuntime = await nativeModulePromise;
  return nativeRuntime;
}

// ---------------------------------------------------------------- pencere

/** @type {BrowserWindow | null} */
let anaPencere = null;

/** Ayar dosyası: ~/.umay/ayarlar.json */
function ayarYolu() {
  return path.join(app.getPath("home"), ".umay", "ayarlar.json");
}

function ayarlariOku() {
  try {
    return JSON.parse(fs.readFileSync(ayarYolu(), "utf8"));
  } catch {
    return {};
  }
}

function ayarlariYaz(ayarlar) {
  const hedef = ayarYolu();
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, JSON.stringify(ayarlar, null, 2), "utf8");
}

function anaPencereOlustur() {
  anaPencere = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#0f1115",
    title: "Umay",
    webPreferences: {
      // GÜVENLİK: arayüz Node'a ve ana sürece doğrudan erişemez.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // preload'un bridge kullanabilmesi için
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  anaPencere.once("ready-to-show", () => anaPencere && anaPencere.show());

  // Dış bağlantılar uygulamada değil, tarayıcıda açılır.
  anaPencere.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  const indexYolu = path.join(__dirname, "..", "dist", "index.html");
  if (fs.existsSync(indexYolu)) {
    anaPencere.loadFile(indexYolu);
  } else {
    anaPencere.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font:14px system-ui;background:#0f1115;color:#e6e8ee;padding:32px">
             <h2>Umay arayüzü bulunamadı</h2>
             <p><code>npm run build</code> çalıştırıp tekrar deneyin.</p>
           </body>`
        )
    );
  }
}

app.whenReady().then(() => {
  anaPencereOlustur();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) anaPencereOlustur();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------- Bridge

/**
 * Bridge daemon yönetimi.
 *
 * NEDEN BURADA
 *
 * Ölçüm (2026-10-05): kullanıcı "dosya oluştur" dedi, plan oluştu,
 * planning görevi tamamlandı, computer görevi QUEUED kaldı. Nedeni:
 *
 *   agent_devices tablosu  →  0 kayıt (cihaz eşleşmemiş)
 *   main.cjs              →  spawn/child_process 0 tane
 *
 * Yani Electron, Bridge'ı hiç başlatmıyordu. Kanal (backend → WebSocket
 * → Bridge → OS) hazırdı; sadece ayakları yoktu.
 *
 * NASIL BAŞLIYORUZ
 *
 * Bridge'ın `bootstrap --start=true` komutu tek başına hepsini yapar:
 *
 *   install  → kurulum + durum dosyası
 *   pair     → backend'e cihaz eşleştirme (kullanıcının access token'ı ile)
 *   start    → daemon'u ayrık (detached) süreç olarak başlatır
 *
 * TOKEN GÜVENLİĞİ
 *
 * Token'ı komut satırına `--access-token` ile VERMİYORUZ. Argümanlar
 * `ps` komutunda tüm kullanıcılara görünür. Bunun yerine Bridge'ın
 * desteklediği `UMAY_ACCESS_TOKEN` ortam değişkenini kullanıyoruz:
 * `accessToken()` sırasıyla option → env → state.json arıyor, yani
 * env yeterli.
 *
 * BİLİEN EKSİK (düzeltilmedi, ölçüldü)
 *
 * 1. Bridge token'ı `~/.umay/bridge/state.json` içine düz yazıyla
 *    yazıyor (`persistAuth`). Kullanıcının kendi makinesinde; başka
 *    biri okuyabilir. Şifreleme eklenmedi.
 * 2. `daemon()` token'ı yenilemiyor. Access token süresi dolunca
 *    bağlantı düşer ve kendiliğinden toparlanmaz.
 *
 * Bu ikisi bu adımı engellemiyor; eklendiğinde ele alınacak.
 */

/** Bridge durum dosyası: ~/.umay/bridge/state.json */
function bridgeStateYolu() {
  return path.join(app.getPath("home"), ".umay", "bridge", "state.json");
}

function bridgeStateOku() {
  try {
    return JSON.parse(fs.readFileSync(bridgeStateYolu(), "utf8"));
  } catch {
    return null;
  }
}

/** Bridge günlüğü son satırları — hata mesajlarını arayüze taşımak için. */
function bridgeLogOku(satir = 25) {
  try {
    const yol = path.join(app.getPath("home"), ".umay", "bridge", "bridge.log");
    const tum = fs.readFileSync(yol, "utf8").trim().split("\n");
    return tum.slice(-satir).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * `bootstrap` komutunu çalıştırıp çıktısını topla.
 * `execFile` kullanıyoruz ki çıktıyı arayüze gerçekten döndürebilelim.
 */
function bridgeCalistir(komutlar, env, zamanAsimiMs = 30000) {
  return new Promise((resolve) => {
    const cocuk = require("node:child_process").execFile(
      process.execPath,
      [path.join(bridgeDir, "index.mjs"), ...komutlar],
      {
        env: {
          ...process.env,
          ...env,
          UMAY_API_BASE: "https://backendu.veriussu.com/api/v1",
          // ELECTRON_RUN_AS_NODE — Bridge'ı normal Node gibi çalıştır.
          //
          // ÖLÇÜM (2026-10-05): Electron ana sürecinde
          // `process.execPath` NODE DEĞİL, Electron binary'sinin
          // kendisidir. Bu değişken olmadan çalıştırınca:
          //
          //   /.../electron/dist/electron .../index.mjs bootstrap
          //   FATAL: Running as root without --no-sandbox is not supported
          //
          // Yani Bridge, Node yerine ikinci bir Electron başlatmaya
          // çalışıyor ve kendi içinde çöküyordu. Bu değişken
          // Electron binary'sine "sadece Node gibi davran" der.
          ELECTRON_RUN_AS_NODE: "1",
        },
        timeout: zamanAsimiMs,
        maxBuffer: 1024 * 1024,
      },
      (hata, stdout, stderr) => {
        resolve({
          hata: hata ? String(hata.message) : null,
          cikisKodu: hata && typeof hata.code === "number" ? hata.code : 0,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      }
    );
    cocuk.on("error", (e) =>
      resolve({ hata: String(e.message), cikisKodu: -1, stdout: "", stderr: "" })
    );
  });
}

/** Cihazı backend'e eşleştir ve komut kanalını aç. */
ipcMain.handle("umay:bridge-baslat", async (_e, { accessToken, refreshToken } = {}) => {
  if (!accessToken) {
    return {
      basarili: false,
      neden: "access_token_yok",
      mesaj: "Önce giriş yapmalısın. Cihaz eşleştirme kullanıcıya bağlıdır.",
    };
  }

  const env = {
    UMAY_ACCESS_TOKEN: String(accessToken),
    UMAY_API_BASE: "https://backendu.veriussu.com/api/v1",
  };
  if (refreshToken) env.UMAY_REFRESH_TOKEN = String(refreshToken);

  // 1) kurulum + eşleştirme + daemon başlatma (tek komutta üçü)
  //
  // DİKKAT: `--start true` AYRI argüman olmalı, `--start=true` DEĞİL.
  //
  // ÖLÇÜM (2026-10-05): ilk denemede `--start=true` yazıldı ve
  // eşleştirme başarılı olmasına rağmen daemon başlamadı:
  //   running: False, daemon_pid: None
  //
  // Bridge'ın `args()` fonksiyonu `--anahtar=değer` biçimini
  // AYRIŞTIRMIYOR. `item.slice(2)` ile anahtarın tamamını alıyor,
  // yani `--start=true` → anahtar `"start=true"`. `options.start`
  // `undefined` kalıyor ve `bootstrap` içindeki
  // `if (options.start === "true")` dalına girmiyor.
  //
  // Doğrusu: `["bootstrap", "--start", "true"]`
  // Ölçüldü: ayrı argümanla → running: True, daemon_pid atandı,
  // süreç yaşıyor.
  const sonuc = await bridgeCalistir(["bootstrap", "--start", "true"], env, 60000);

  const durum = bridgeDurumIcine();
  return {
    basarili: Boolean(durum.deviceId) && !sonuc.hata,
    cikisKodu: sonuc.cikisKodu,
    stdout: sonuc.stdout,
    stderr: sonuc.stderr,
    hata: sonuc.hata,
    durum,
    gunluk: bridgeLogOku(15),
    // Bağlantı neden kurulamadıysa kullanıcıya gösterebilmek için
    // son günlük satırları. Token içermez (maskSecrets uygulanmış log).
    sonHata: bridgeLogOku(10).slice(-5),
  };
});

/** Bridge'ı durdur. */
ipcMain.handle("umay:bridge-durdur", async () => {
  const sonuc = await bridgeCalistir(["stop"], {}, 15000);
  return { basarili: sonuc.cikisKodu === 0, stdout: sonuc.stdout, stderr: sonuc.stderr, durum: bridgeDurumIcine() };
});

/**
 * Cihaz durumu — arayüze gösterilecek özet.
 *
 * GÜVENLİK: token'lar BURAYA DÖNMÜYOR. Arayüz zaten kendi
 * token'ını localStorage'da tutuyor; bizim tekrar göndermemize
 * gerek yok ve gönderirsek saldırı yüzeyi büyür.
 */
function bridgeDurumIcine() {
  const s = bridgeStateOku();
  if (!s) {
    return {
      kurulu: false,
      calisiyor: false,
      deviceId: null,
      cihazAdi: null,
      platform: null,
      sonHata: bridgeLogOku(8).slice(-3),
    };
  }
  return {
    kurulu: Boolean(s.installed),
    calisiyor: Boolean(s.running),
    deviceId: s.device_id || null,
    cihazAdi: s.device_name || null,
    platform: s.platform ? `${s.platform}/${s.arch || "?"}` : null,
    eşlesTarih: s.auth?.paired_at || null,
    sonKomut: s.last_command_at || null,
    sonHata: bridgeLogOku(8).slice(-3),
  };
}

ipcMain.handle("umay:bridge-durum", async () => bridgeDurumIcine());

// ---------------------------------------------------------------- IPC

/** Ekran görüntüsü al → base64 PNG döndür. */
ipcMain.handle("umay:ekran", async () => {
  const rt = await loadNative();
  const sonuc = await rt.handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: { action: { kind: "screen_observe" } },
    },
  });
  return sonuc;
});

/** Tıklama: {x, y} */
ipcMain.handle("umay:tikla", async (_e, { x, y }) => {
  const rt = await loadNative();
  return rt.handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: { action: { kind: "mouse_click", x: Number(x), y: Number(y) } },
    },
  });
});

/** Yaz: {metin} */
ipcMain.handle("umay:yaz", async (_e, { metin }) => {
  const rt = await loadNative();
  return rt.handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: { action: { kind: "keyboard_type", text: String(metin ?? "") } },
    },
  });
});

/** Terminal komutu çalıştır: {komut: [...]} */
ipcMain.handle("umay:terminal", async (_e, { komut }) => {
  const rt = await loadNative();
  return rt.handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: { action: { kind: "terminal_run", command: komut } },
    },
  });
});

/** Yapıştır panoya. */
ipcMain.handle("umay:panoya", async (_e, { metin }) => {
  const rt = await loadNative();
  return rt.handleNativeCommand({
    command: {
      command_type: "computer.native_action",
      payload: { action: { kind: "clipboard_write", text: String(metin ?? "") } },
    },
  });
});

/** Bu makinede ne yapabiliriz? */
ipcMain.handle("umay:yetenekler", async () => {
  const rt = await loadNative();
  return rt.nativeCapabilityReport();
});

/** Backend bağlantı ayarları. */
ipcMain.handle("umay:ayarlar-oku", async () => ayarlariOku());
ipcMain.handle("umay:ayarlar-yaz", async (_e, ayarlar) => {
  ayarlariYaz(ayarlar || {});
  return true;
});