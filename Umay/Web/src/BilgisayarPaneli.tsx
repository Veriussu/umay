/**
 * Bilgisayar paneli — bu makinede ne yapılabildiğini gösterir.
 *
 * NEDEN AYRI DOSYA
 *
 * `main.tsx` 1500 satırdır. OS yetenekleri hem masaüstü uygulamasında
 * hem tarayıcıda farklı davranır; bu mantığı ayrı tutmak hem test
 * edilmesini kolaylaştırır hem de `main.tsx`'i şişirmez.
 *
 * DÜRÜSTLÜK KURALI
 *
 * Bir yetenek `available: false` ise panel bunu gizlemez, açıkça
 * gösterir ve NEDENini yazar. 2026-09-30'da "ekran görüntüsü alındı"
 * denip alınmadığı bir hata bulunmuştu; sessiz başarısızlık en kötü
 * davranıştır.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  masaustuMu,
  yetenekleriOku,
  cihazDurumuOku,
  cihazBaglat,
  type YetenekRaporu,
  type CihazDurumu,
} from "./lib/umayDesktop";
import { getAccessToken, getRefreshToken } from "./lib/api";

const YETENEK_ETIKET: Record<string, string> = {
  screen_observe: "Ekranı gör",
  mouse_click: "Fare",
  keyboard_type: "Klavye",
  clipboard_write: "Pano",
  file_read: "Dosya oku",
  file_write: "Dosya yaz",
  terminal_run: "Terminal",
  process_start: "Uygulama aç",
};

/** Yetenek sırası — en çok kullanılan önce. */
const SIRA = [
  "screen_observe",
  "mouse_click",
  "keyboard_type",
  "terminal_run",
  "file_read",
  "file_write",
  "clipboard_write",
  "process_start",
];

const TON: Record<string, string> = {
  screen_observe: "#a78bfa",
  mouse_click: "#38bdf8",
  keyboard_type: "#22d3ee",
  terminal_run: "#34d399",
  file_read: "#fbbf24",
  file_write: "#fbbf24",
  clipboard_write: "#f472b6",
  process_start: "#94a3b8",
};

export function BilgisayarPaneli({ compact = false }: { compact?: boolean }) {
  const [rapor, setRapor] = useState<YetenekRaporu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [cihaz, setCihaz] = useState<CihazDurumu | null>(null);
  const [baglaniyor, setBaglaniyor] = useState(false);
  const [baglantiHatasi, setBaglantiHatasi] = useState<string | null>(null);

  const yenile = useCallback(async () => {
    setYukleniyor(true);
    const veri = await yetenekleriOku();
    setRapor(veri);
    const d = await cihazDurumuOku();
    setCihaz(d);
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    if (masaustuMu()) void yenile();
  }, [yenile]);

  const bagla = useCallback(async () => {
    setBaglaniyor(true);
    setBaglantiHatasi(null);
    const sonuc = await cihazBaglat(getAccessToken(), getRefreshToken());
    if (!sonuc) {
      setBaglantiHatasi("Cihaz bağlantısı kurulamadı.");
    } else if (!sonuc.basarili) {
      // NEDEN GÖSTERİLİYOR — sessiz hata en kötü davranıştır.
      setBaglantiHatasi(
        sonuc.mesaj ||
          sonuc.stderr ||
          sonuc.hata ||
          (sonuc.sonHata?.length ? sonuc.sonHata.join(" · ") : "Bağlantı kurulamadı.")
      );
    } else {
      setCihaz(sonuc.durum ?? null);
    }
    setBaglaniyor(false);
    void yenile();
  }, [yenile]);

  const cihazBagli = Boolean(cihaz?.deviceId) && Boolean(cihaz?.calisiyor);

  // --- Tarayıcı modu ------------------------------------------------
  if (!masaustuMu()) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="text-sm font-medium text-white/90">Bilgisayar kontrolü</div>
        <p className="mt-1.5 text-xs leading-relaxed text-white/55">
          Bu özellik masaüstü uygulamasında çalışır. Tarayıcıdan yalnızca
          sohbet, hafıza ve arama özelliklerini kullanabilirsiniz.
        </p>
      </div>
    );
  }

  if (yukleniyor && !rapor) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-xs text-white/50">
        Yetenekler okunuyor…
      </div>
    );
  }

  if (!rapor) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
        <div className="text-sm font-medium text-amber-200">Yetenekler okunamadı</div>
        <p className="mt-1.5 text-xs text-amber-200/75">
          Bu makinede ne yapılabildiğini öğrenemedim. Bilgisayar kontrolü
          çalışmayabilir.
        </p>
        <button
          onClick={() => void yenile()}
          className="mt-3 rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/10"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const oturum = rapor.session?.type || "bilinmiyor";
  const ekranVar = Boolean(rapor.actions?.screen_observe?.available);
  const fareVar = Boolean(rapor.actions?.mouse_click?.available);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white/90">Bilgisayar kontrolü</div>
          <div className="mt-0.5 text-[11px] text-white/45">
            {rapor.platform} · {oturum} oturumu
          </div>
        </div>
        <button
          onClick={() => void yenile()}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-white/60 hover:bg-white/5"
        >
          Yenile
        </button>
      </div>

      {/* Cihaz bağlantısı ----------------------------------------------------
          *
          * Bu, yetenek listesinden ÖNCE gelmeli. Çünkü cihaz backend'e
          * eşleşmemişse yetenekler yeşil görünse bile Umay bu bilgisayara
          * komut gönderemez — plan oluşur, görev kuyrukta kalır, hiçbir
          * şey olmaz. 2026-10-05'te ölçülen tam olarak buydu:
          *   agent_devices → 0 kayıt, computer görevi QUEUED.
          */}
      <div
        className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${
          cihazBagli
            ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100"
            : "border-amber-400/25 bg-amber-400/[0.07] text-amber-100"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium">
              {cihazBagli ? "Bu bilgisayar Umay'a bağlı" : "Bu bilgisayar Umay'a bağlı değil"}
            </div>
            <div className="mt-0.5 text-[11px] opacity-80">
              {cihazBagli
                ? `Cihaz #${cihaz?.deviceId} · ${cihaz?.cihazAdi || ""} · komut kanalı açık`
                : "Bağlanmadan önceki yetenekler yalnızca bu panelde çalışır; Umay senin bilgisayarını kullanamaz."}
            </div>
          </div>
          {!cihazBagli && (
            <button
              onClick={() => void bagla()}
              disabled={baglaniyor}
              className="shrink-0 rounded-lg border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-300/20 disabled:opacity-50"
            >
              {baglaniyor ? "Bağlanıyor…" : "Bağlan"}
            </button>
          )}
        </div>

        {baglantiHatasi && (
          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-2 text-[10px] leading-relaxed text-amber-50/90">
            {baglantiHatasi}
          </pre>
        )}
      </div>

      {/* Durum özeti: en kritik bilgi — ekran ve fare çalışıyor mu? */}
      <div
        className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${
          ekranVar
            ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100"
            : "border-amber-400/25 bg-amber-400/[0.07] text-amber-100"
        }`}
      >
        {ekranVar
          ? fareVar
            ? "Ekranı görebiliyor ve fareyi kullanabiliyorum."
            : "Ekranı görebiliyorum ama fare kullanılamıyor. Tıklama yerine klavye ve terminal kullanacağım."
          : "Ekranı göremiyorum. Bilgisayar kontrolü için ekran erişimi gerekiyor."}
      </div>

      {/* Yetenek listesi — kapananlar nedeniyle birlikte gösterilir. */}
      {!compact && (
        <ul className="mt-3 space-y-1.5">
          {SIRA.map((ad) => {
            const y = rapor.actions?.[ad];
            const hazir = Boolean(y?.available);
            const renk = TON[ad] || "#94a3b8";
            return (
              <li
                key={ad}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-white/[0.015] px-3 py-2"
              >
                <span className="flex items-center gap-2 text-xs text-white/80">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: hazir ? renk : "#64748b" }}
                  />
                  {YETENEK_ETIKET[ad] || ad}
                </span>
                {hazir ? (
                  <span className="shrink-0 text-[10px] text-white/40">{y?.adapter || "hazır"}</span>
                ) : (
                  <span className="shrink-0 text-right text-[10px] text-amber-200/70">
                    {y?.reason || "kullanılamıyor"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rapor.session?.reason === "session_type_unknown" && (
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">
          Masaüstü oturumu tespit edilemedi. Bridge bir oturum içinde
          çalışmalı; terminalden (masaüstü olmadan) başlatıldıysa fare ve
          ekran çalışmaz.
        </p>
      )}
    </div>
  );
}

export default BilgisayarPaneli;