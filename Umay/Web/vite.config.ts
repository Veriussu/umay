import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // `base` NEDEN "./" OLMALI
  //
  // ÖLÇÜM (2026-10-05): Electron'da uygulama boş pencere olarak
  // açılıyordu. Renderer DOM'u ölçüldü:
  //
  //   kokVar: true, kokCocuk: 0, kokHtmlUzunluk: 0, govdeMetni: ""
  //
  // Yani `#root` var ama içi hiç dolmamış — React hiç mount olmamış.
  // Konsolda JS hatası yok, bu yüzden "çalışıyor sanılan" sessiz
  // bir hataydı.
  //
  // Sebep: Vite varsayılan `base: '/'` ile derliyor ve `index.html`'e
  // mutlak yol yazıyor:
  //
  //   <script src="/assets/index-BIRM63lG.js">
  //
  // Tarayıcıda (http://localhost:9056) bu doğru çalışır. Ama Electron
  // `loadFile()` kullanıyor, yani protokol `file://`. Bu durumda
  // `/assets/...` dosya sisteminin KÖKÜne gider (`/assets/`), uygulama
  // klasörüne değil. Betik bulunamaz → mount olmaz → boş pencere.
  //
  // `./` ile Vite göreli yol yazar (`./assets/...`) ve `file://`
  // altında doğru çözülür. http altında da çalışır, bu yüzden web
  // arayüzü etkilenmez.
  base: "./",

  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_WEB_PORT || 9056),
    strictPort: true,
    allowedHosts: true
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_WEB_PORT || 9056),
    strictPort: true,
    allowedHosts: true
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2022"
  }
});
