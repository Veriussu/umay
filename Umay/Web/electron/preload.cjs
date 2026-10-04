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

  /** Masaüstü uygulamasında mıyız? (tarayıcıda false) */
  masaustu: true,
});