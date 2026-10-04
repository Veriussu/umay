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