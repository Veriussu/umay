#!/usr/bin/env node
/**
 * Linux sandbox izin düzeltmesi.
 *
 * SORUN
 *
 * Electron, Linux'ta çalışırken `chrome-sandbox` adlı küçük bir
 * yardımcı ikili dosyasını kullanır. Bu dosya `setuid` bitiyle
 * çalışır ki, tarayıcı süreci (renderer) düşük yetkili kalsın.
 *
 * `npm install` bu biti düşürüyor. Sonuç:
 *
 *     FATAL:setuid_sandbox_host.cc The SUID sandbox helper binary was
 *     found, but is not configured correctly.
 *
 * Electron güvenlikten ödün vermeyi reddediyor ve uygulamayı
 * başlatmıyor. Bu, hata değil — koruma çalışıyor.
 *
 * ÇÖZÜM
 *
 * Dosyayı yeniden `root` sahipliğine alıp `4755` (setuid) yapmak.
 *
 * NEDEN BİR KERE YAPIP UNUTMALI
 *
 * Her `npm install`/`npm ci` sonrasında `node_modules` yeniden
 * kurulur ve bit tekrar düşer. Bu yüzden `postinstall` betiğiyle
 * bağlanır: kurulum biter bitmez otomatik düzeltilir.
 *
 * GÜVENLİK
 *
 * `npm config set ignore-scripts true` ayarı varsa bu betik
 * çalışmaz. Bu durumda `npm run sandbox:duzelt` ile elle
 * çalıştırılmalıdır.
 *
 * Bu betik SADECE izin ayarlar; kod indirmez, ağa çıkmaz.
 */

import { statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEDEF = join(
  __dirname,
  "..",
  "node_modules",
  "electron",
  "dist",
  "chrome-sandbox"
);

function ok(mesaj) {
  console.log(`  ✓ ${mesaj}`);
}

function hata(mesaj) {
  console.error(`  ✗ ${mesaj}`);
}

function durumuOku() {
  try {
    const s = statSync(HEDEF);
    return { mod: (s.mode & 0o7777).toString(8), sahip: s.uid };
  } catch {
    return null;
  }
}

function duzelt() {
  const durum = durumuOku();

  if (!durum) {
    // Electron kurulmamış olabilir; bu bir hata değil.
    hata("chrome-sandbox bulunamadı (Electron kurulmamış olabilir).");
    return false;
  }

  const dogru = durum.mod === "4755";

  if (dogru && durum.sahip === 0) {
    ok("sandbox zaten doğru (root, 4755)");
    return true;
  }

  // CI/servis hesabı zaten root ise sudo'ya gerek yok.
  const rootMu = typeof process.getuid === "function" && process.getuid() === 0;
  const onek = rootMu ? "" : "sudo ";

  console.log("  → izinler düzeltiliyor...");
  try {
    if (rootMu) {
      execFileSync("chown", ["root:root", HEDEF], { stdio: "inherit" });
      execFileSync("chmod", ["4755", HEDEF], { stdio: "inherit" });
    } else {
      execFileSync("sudo", ["chown", "root:root", HEDEF], { stdio: "inherit" });
      execFileSync("sudo", ["chmod", "4755", HEDEF], {
        stdio: "inherit",
      });
    }
  } catch (e) {
    hata(
      "düzeltilemedi. Elle deneyin:\n" +
        `      ${onek}chown root:root ${HEDEF}\n` +
        `      ${onek}chmod 4755 ${HEDEF}`
    );
    return false;
  }

  const sonra = durumuOku();
  if (sonra && sonra.mod === "4755") {
    ok(`sandbox düzeltildi (root, ${sonra.mod})`);
    return true;
  }
  hata(`düzeltildi ama izin ${sonra?.mod} görünüyor.`);
  return false;
}

// electron-builder paketlerken bu dosyayı DÜZGÜN izinle çıkarır;
// kurulum sonrası kontrolü atlayabiliriz.
if (process.env.UMAY_SANDBOX_SKIP === "1") {
  process.exit(0);
}

console.log("Electron sandbox izinleri kontrol ediliyor...");
const basarili = duzelt();
process.exit(basarili ? 0 : 1);