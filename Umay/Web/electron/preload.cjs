/**
 * Preload — arayüz ile ana süreç arasındaki TEK güvenli köprü.
 *
 * Arayüz (renderer) Node'a erişemez; sadece burada tanımlanan
 * fonksiyonları çağırabilir. Böylece "bu butona tıkla" diyen arayüz
 * kodu, OS'a kendisi dokunamaz — ana süreç yapar.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("umay", {
  /** Bu makinede ne yapılabilir? */
  yetenekler: () => ipcRenderer.invoke("umay:yetenekler"),

  /** Ekran görüntüsü al. */
  ekran: () => ipcRenderer.invoke("umay:ekran"),

  /** Verilen koordinata tıkla. */
  tikla: (x, y) => ipcRenderer.invoke("umay:tikla", { x, y }),

  /** Klavyeyi kullanarak metin yaz. */
  yaz: (metin) => ipcRenderer.invoke("umay:yaz", { metin }),

  /** Terminal komutu çalıştır (argv dizisi). */
  terminal: (komut) => ipcRenderer.invoke("umay:terminal", { komut }),

  /** Panoya kopyala. */
  panoya: (metin) => ipcRenderer.invoke("umay:panoya", { metin }),

  /** Backend bağlantı ayarları. */
  ayarlarOku: () => ipcRenderer.invoke("umay:ayarlar-oku"),
  ayarlarYaz: (ayarlar) => ipcRenderer.invoke("umay:ayarlar-yaz", ayarlar),

  /**
   * Cihazı backend'e eşleştir ve komut kanalını aç.
   *
   * Token'lar arayüzden geliyor çünkü giriş bilgisi orada
   * (`localStorage`). Ana süreç bunları komut satırına YAZMAZ —
   * `ps` herkese görünür. Ortam değişkeniyle geçer.
   *
   * Dönen sonuçta token YOK.
   */
  bridgeBaslat: (accessToken, refreshToken) =>
    ipcRenderer.invoke("umay:bridge-baslat", { accessToken, refreshToken }),

  /** Cihaz durumu (token içermez). */
  bridgeDurum: () => ipcRenderer.invoke("umay:bridge-durum"),

  /** Cihaz bağlantısını kapat. */
  bridgeDurdur: () => ipcRenderer.invoke("umay:bridge-durdur"),

  /** Masaüstü uygulamasında mıyız? (tarayıcıda false) */
  masaustu: true,
});