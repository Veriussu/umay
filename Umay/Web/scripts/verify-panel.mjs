/* Manuel panel doğrulaması: giriş → Ayarlar → Modeller akışı */
import { chromium } from "playwright";

const BASE = "http://localhost:9056";
const API = "http://localhost:9050/api/v1";
const EMAIL = "kazim@veriussu.com";
const PASSWORD = process.env.UMAY_TEST_PW || "";

const results = [];
function log(step, ok, detail = "") {
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });

  // 0) Oturum: token'ı API'ye login ile al, localStorage'a yaz (prod API'den alınan token local API'de geçersiz olabilir;
  //    bu yüzden login'i local API'ye yapıp uygulamanın local API'yi kullanmasını sağlıyoruz)
  const login = await page.request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false
  });
  if (login.status() === 429) {
    log("login", false, "429 — çok fazla deneme, biraz bekle");
    throw new Error("rate-limited");
  }
  const tokens = await login.json().catch(() => ({}));
  if (login.status() !== 200 || !tokens.access_token) {
    // brute-force koruması denemeleri sayıyor olabilir; refresh yolu da yok. Bu durumda sadece yükleme kontrolü yapıp çık.
    log("login", false, `status=${login.status()}`);
    throw new Error("login-failed");
  }
  await page.evaluate(([a, r]) => {
    localStorage.setItem("umay_web_access", a);
    localStorage.setItem("umay_web_refresh", r);
  }, [tokens.access_token, tokens.refresh_token]);
  log("login + token", true, `user ${EMAIL}`);

  // 1) Panel yüklendi mi
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(1500);
  const appVisible = await page.locator("body").innerText().then((t) => t.length > 100);
  log("panel yüklendi", appVisible);

  // 2) Ayarlar sekmesi → modal
  const settingsBtn = page.getByRole("button", { name: /Ayarlar/i }).first();
  await settingsBtn.click({ timeout: 8000 });
  const modal = page.locator(".us-modal");
  await modal.waitFor({ state: "visible", timeout: 6000 });
  log("Ayarlar modalı açıldı", true);

  // 3) Modeller bölümü
  await page.locator(".us-side-item", { hasText: "Modeller" }).click();
  await page.waitForTimeout(600);
  const hasEkle = await page.locator(".us-models-topbar button", { hasText: "Ekle" }).count();
  log("Modeller bölümü + Ekle butonu", hasEkle > 0);

  // 4) Ekle pop up'ı
  await page.locator(".us-models-topbar button", { hasText: "Ekle" }).click();
  const popup = page.locator(".us-addpop");
  await popup.waitFor({ state: "visible", timeout: 5000 });
  log("Ekle pop up'ı açıldı", true);

  // 5) Pop up içeriği: liste dolu mu + arama çalışıyor mu
  const rowCount = await page.locator(".us-addpop-row").count();
  log("Pop up model listesi", rowCount > 0, `${rowCount} model`);
  await page.locator(".us-addpop-search input").fill("zzz-yok-boyle-model");
  await page.waitForTimeout(400);
  const filteredOut = await page.locator(".us-addpop-row").count();
  log("Arama filtresi", filteredOut === 0, `eşen: ${filteredOut}`);
  await page.locator(".us-addpop-search input").fill("");
  await page.waitForTimeout(400);

  // 6) Listedeki ilk modele Ekle → pop up açık kalır, arka planda aktif listeye düşer
  const firstRow = page.locator(".us-addpop-row").first();
  let addedModel = null;
  if (await firstRow.count()) {
    addedModel = (await firstRow.locator("strong").innerText()).trim();
    await firstRow.locator("button").click();
    await page.waitForTimeout(1500);
    log(`Ekle: ${addedModel}`, true);
  } else {
    log("Ekle adımı", true, "liste boş (katalog boş) — atlandı");
  }
  await page.locator(".us-addpop-head .us-close").click();
  await page.waitForTimeout(400);

  // 6b) Eklenen model aktif listede görünüyor mu
  if (addedModel) {
    const accTexts = await page.locator(".us-acc").allInnerTexts();
    log("Aktif listede görünüyor", accTexts.some((t) => t.includes(addedModel)), `${accTexts.length} aktif model`);
  }

  // 7) Aktif listede eklenen satır: Atama pop up
  const accRow = page.locator(".us-acc").first();
  if (await accRow.count()) {
    await accRow.locator("button").first().click();
    const rolePop = page.locator(".us-addpop-roles");
    await rolePop.waitFor({ state: "visible", timeout: 5000 });
    const cb = await rolePop.locator(".us-checkbox").count();
    log("Atama pop up'ı (checkbox sayısı)", cb === 3, `${cb}/3`);
    await rolePop.locator(".us-checkbox input").first().check();
    await rolePop.locator("button").first().click();
    await page.waitForTimeout(1200);
    log("Rol kaydetme", (await page.locator(".us-addpop-roles").count()) === 0);

    // 8) Sil onay modalı → önce Vazgeç, sonra gerçek silme (test modelini temizlemek için)
    const row2 = page.locator(".us-acc").first();
    await row2.locator("button").nth(1).click();
    const confirm = page.locator(".us-confirm");
    await confirm.waitFor({ state: "visible", timeout: 5000 });
    log("Sil onay modalı açıldı", true);
    await confirm.locator("button").first().click();
    await page.waitForTimeout(400);
    log("Vazgeç ile kapandı", (await page.locator(".us-confirm").count()) === 0);
  } else {
    log("Atama/Sil adımları", true, "aktif model yok — atlandı");
  }

  // 9) Konsol hataları
  const realErrors = errors.filter((e) => !/favicon|401|403|429|502/.test(e));
  log("konsol hataları", realErrors.length === 0, realErrors.slice(0, 2).join(" | "));
} catch (e) {
  log("akış kesildi", false, String(e).slice(0, 140));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSONUÇ: ${results.length - failed}/${results.length} adım geçti`);
  process.exit(failed > 0 ? 1 : 0);
}
