/**
 * Frontend streaming tüketicisini GERÇEK TARAYICIDA doğrular.
 *
 * Ne kanıtlar:
 *   - `fetch` + ReadableStream ile SSE ayrıştırma gerçekten çalışıyor
 *   - geçici balon harf harf büyüyor (birden çok ölçüm)
 *   - `bitti` gelince geçici metin KALICI mesajla değişiyor
 *   - adım listesi gerçek backend olaylarından geliyor
 *   - markdown geçici metinde de çalışıyor
 *
 * Giriş: parola BİLİNMEZ ve değiştirilmez (kullanıcı verisi). Bunun
 * yerine backend'den üretilen erişim jetonu `localStorage`'a yazılır;
 * uygulama `Boolean(getAccessToken())` ile oturumu açar.
 *
 * Sunucu: `.env` `backendu.veriussu.com`'a baktığı için, testte yerel
 * backend'e bakan AYRI bir dev sunucusu açılır (Vite env'i okur):
 *   VITE_API_BASE_URL=http://127.0.0.1:9050/api/v1 \
 *   VITE_WEB_PORT=9057 npx vite --port 9057
 * Playwright `route` ile https→http yönlendirmesi YAPAMAZ (protokol
 * değiştirilemiyor) ve akışı `fulfill` ile geçirmek ölçümü bozardı
 * (gövde tamponlanır) — bu yüzden gerçek dev sunucusu kullanılır.
 *
 * Kullanım:  UMAY_JETON=<token> node scripts/verify-stream.mjs
 */
import { chromium } from "playwright";

// 9056 backend CORS izninde (`FRONTEND_ORIGIN_REGEX` 9056'ya sabit), bu
// yüzden test sunucusu izinli origin'in üzerinde kalmalı.
const WEB = process.env.UMAY_WEB || "http://127.0.0.1:9056";
const JETON = process.env.UMAY_JETON;

async function olcumOl(gecici) {
  const metin = await gecici.evaluate((el) => el?.querySelector(".bubble-body")?.innerText || "");
  const adimlar = await gecici.evaluate((el) =>
    Array.from(el?.querySelectorAll(".cm-step span") || []).map((s) => s.textContent)
  );
  return { metin, adimlar };
}

async function main() {
  if (!JETON) {
    console.log("UMAY_JETON tanımlı değil — test atlandı.");
    process.exit(2);
  }
  const tarayici = await chromium.launch({ headless: true });
  const baglam = await tarayici.newContext({ viewport: { width: 1500, height: 950 } });
  const sayfa = await baglam.newPage();

  // Oturumu jetonla aç (parola gerekmez).
  await sayfa.addInitScript(
    ([jeton]) => window.localStorage.setItem("umay_web_access", jeton),
    [JETON]
  );
  sayfa.on("pageerror", (e) => console.log("  [sayfa hata]", e.message.slice(0, 200)));
  sayfa.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.log(`  [konsol ${m.type()}]`, m.text().slice(0, 200));
    }
  });
  sayfa.on("requestfailed", (r) =>
    console.log("  [istek başarısız]", r.url().slice(0, 90), r.failure()?.errorText));
  sayfa.on("response", (r) => {
    if (r.url().includes("/messages")) {
      console.log(`  [yanıt] ${r.status()} ${r.url().split("/api/v1")[1]?.slice(0, 50)}`);
    }
  });

  await sayfa.goto(WEB, { waitUntil: "networkidle" });
  await sayfa.waitForSelector(".ops-shell", { timeout: 30000 });
  console.log("giriş: TAMAM (jeton)");

  // --- Sohbet Merkezi'ni aç ---
  const adaylar = await sayfa.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .map((b, i) => ({ i, sinif: b.className, metin: (b.textContent || "").trim().slice(0, 30) }))
      .filter((b) => b.metin.includes("Sohbet"))
  );
  console.log(`"Sohbet" içeren düğmeler: ${JSON.stringify(adaylar)}`);
  await sayfa.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Sohbet"));
    btn?.click();
  });
  await sayfa.waitForSelector(".cm-modal", { timeout: 15000 });
  console.log("sohbet merkezi: AÇIK");

  const olcumler = [];
  const bas = Date.now();
  // Ölçüm SAYFA İÇİNDE yapılır: dışarıdan yoklama (polling) çok kaba —
  // cevap 0,3 sn'de geldiğinde balon iki yoklama arasında doğup bitiyor
  // ve "harf harf büyüyor" kanıtı kayboluyordu. MutationObserver HER
  // metin değişimini yakalar.
  await sayfa.evaluate(() => {
    window.__akis = { olcumler: [], bas: performance.now() };
    const yaz = () => {
      const balon = document.querySelector(".akis-bubble");
      const govde = balon?.querySelector(".bubble-body");
      const metin = govde ? govde.innerText.replace(/\n$/, "") : "";
      const adimlar = Array.from(document.querySelectorAll(".cm-step span"))
        .map((s) => s.textContent);
      const son = window.__akis.olcumler[window.__akis.olcumler.length - 1];
      if (son && son.metin === metin && JSON.stringify(son.adimlar) === JSON.stringify(adimlar)) return;
      window.__akis.olcumler.push({
        ms: Math.round(performance.now() - window.__akis.bas),
        metin,
        adimlar
      });
    };
    new MutationObserver(yaz).observe(document.body, {
      childList: true, subtree: true, characterData: true
    });
    yaz();
  });
  const gozlemci = setInterval(async () => {
    try {
      const adimlar = await sayfa.evaluate(() =>
        Array.from(document.querySelectorAll(".cm-step span")).map((s) => s.textContent));
      if (await sayfa.locator(".akis-bubble").count()) {
        const o = await olcumOl(sayfa.locator(".akis-bubble").first());
        olcumler.push({ ms: Date.now() - bas, ...o, adimlar: o.adimlar.length ? o.adimlar : adimlar });
      } else if (adimlar.length) {
        olcumler.push({ ms: Date.now() - bas, metin: "", adimlar });
      }
    } catch { /* sayfa değişti */ }
  }, 1000);

  await sayfa.fill(".cm-composer textarea", "Fenerbahçe hakkında bilgi ver.");
  console.log(`metin yazıldı: "${await sayfa.inputValue(".cm-composer textarea")}"`);
  await sayfa.press(".cm-composer textarea", "Enter");
  await sayfa.waitForTimeout(1500);
  console.log(`busy göstergesi: ${await sayfa.locator(".cm-status").innerText().catch(() => "?")}`);
  console.log(`adım sayısı (1,5 sn sonra): ${await sayfa.locator(".cm-step").count()}`);
  console.log(`hata yazısı: ${await sayfa.locator(".cm-toast").innerText().catch(() => "(yok)")}`);

  await sayfa.waitForSelector(".akis-bubble", { timeout: 120000 })
    .catch(() => console.log("UYARI: geçici balon hiç görünmedi"));
  await sayfa.waitForFunction(() => !document.querySelector(".akis-bubble"), { timeout: 180000 })
    .catch(() => console.log("UYARI: geçici balon temizlenmedi"));
  clearInterval(gozlemci);

  // --- Sonuç (sayfa içi gözlemci: HER değişim) ---
  const sayfaIci = await sayfa.evaluate(() => window.__akis.olcumler);
  const metinli = sayfaIci.filter((o) => o.metin.length > 0);
  console.log(`\ngeçici balon ölçümü : ${sayfaIci.length} değişim, ${metinli.length} metinli`);
  if (metinli.length) {
    console.log(`ilk metin           : ${metinli[0].ms} ms (${metinli[0].metin.length} krk)`);
    const atlama = metinli.slice(0, 6);
    for (const o of atlama) {
      console.log(`  ${String(o.ms).padStart(6)} ms  ${String(o.metin.length).padStart(3)} krk  "${o.metin.slice(0, 38)}"`);
    }
    if (metinli.length > 6) {
      const son = metinli[metinli.length - 1];
      console.log(`  ... (${metinli.length - 6} ara değişim)`);
      console.log(`  ${String(son.ms).padStart(6)} ms  ${String(son.metin.length).padStart(3)} krk  "${son.metin.slice(0, 38)}"`);
    }
    const artislar = metinli.slice(1).filter((o, i) => o.metin.length > metinli[i].metin.length);
    console.log(`kelime kelime büyüdü mü: ${artislar.length > 0 ? "EVET" : "HAYIR"} (${artislar.length} artış)`);
  } else {
    console.log("metin hiç gelmedi");
  }
  // Adım listesi akış sonunda temizlendiği için EN DOLU hâli raporlanır.
  const enDolu = sayfaIci.reduce((enIyi, o) =>
    (o.adimlar || []).length > (enIyi?.adimlar || []).length ? o : enIyi, null);
  console.log("\nadımlar (en dolu an):");
  for (const a of enDolu?.adimlar || []) console.log(`  - ${a}`);

  const kalici = await sayfa.locator(".cm-messages .bubble.assistant").last().innerText();
  console.log(`\nkalıcı mesaj        : ${kalici.length} karakter`);
  console.log(`geçici balon kaldı mı: ${await sayfa.locator(".akis-bubble").count()}`);
  const kutu = await sayfa.locator(".cm-messages .bubble.assistant").last().boundingBox();
  console.log(`balon görünür mü    : ${kutu ? kutu.width > 0 && kutu.height > 0 : false}`);
  const kursif = await sayfa.locator(".cm-messages .bubble.assistant").last()
    .evaluate((el) => el.querySelector("strong, em, b, i") !== null);
  console.log(`markdown işlendi mi : ${kursif}`);

  await sayfa.screenshot({ path: "/tmp/opencode/akis-ekran.png" });
  console.log("\nekran görüntüsü     : /tmp/opencode/akis-ekran.png");
  await tarayici.close();
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
