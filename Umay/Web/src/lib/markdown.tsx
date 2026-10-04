/**
 * Model cevaplarını zengin biçimde gösterir.
 *
 * Neden bu dosya var: model cevabı zaten markdown üretiyor
 * (`- madde`, `**kalın**`, ``` kod ```) ama düz metin basıldığı için
 * ekranda `**kalın**` işaretleri ham biçimde görünüyordu.
 *
 * Güvenlik: `dangerouslySetInnerHTML` hiç kullanılmıyor; her şey React
 * öğesi olarak üretiliyor. Bağlantılarda yalnızca http/https/mailto
 * kabul ediliyor, böylece modelin ürettiği `javascript:` bağlantısı
 * çalıştırılamaz.
 */
import { useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Bağlantı güvenliği                                                  */
/* ------------------------------------------------------------------ */

function guvenliHref(url: string): string | null {
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  // Göreli yol ve javascript: gibi şemalar reddedilir.
  return null;
}

/* ------------------------------------------------------------------ */
/* Satır içi biçimlendirme                                             */
/* ------------------------------------------------------------------ */

/** Satır içi kalıplar.
 *
 *  Grup NUMARASI yerine AD kullanılıyor: numaralı grupları saymak
 *  kolay yanlış yapılıyor ve 2026-09-27'de bağlantı metni sessizce
 *  kayboldu (`[tff.org](...)` -> bosluk). Adlandırılmış grup yanlışa
 *  yer vermiyor.
 *
 *  DİKKAT: regex her `inline()` çağrısında YENİDEN oluşturulur.
 *  Modül düzeyinde `g` bayraklı paylaşılan bir regex, iç içe çağrılarda
 *  (kalın içinde italik) `lastIndex`'i bozar ve sonsuz özyineleme
 *  yaratır — bu da bellek taşması olarak ölçüldü.
 */
const INLINE_KAYNAK =
  /(?<kod>`[^`\n]+`)|(?<kalin>\*\*[\s\S]+?\*\*|__[\s\S]+?__)|(?<italik>\*[^*\n]+\*|_[^_\n]+_)|(?<uzerilmis>~~[\s\S]+?~~)|(?<baglanti>\[[^\]\n]+\]\([^)\s]*\))|(?<otomatik>https?:\/\/[^\s<>()]+)/g;

const inlineRegex = () => new RegExp(INLINE_KAYNAK.source, "g");

/** Düz metni React düğümlerine çevirir. Kaçış/`<script>` yazılamaz çünkü
 *  her şey metin düğümü veya bilinen etiketlerden üretilir. */
function inline(text: string, anahtar = "i"): ReactNode[] {
  const cikti: ReactNode[] = [];
  let son = 0;
  let sayac = 0;
  const re = inlineRegex();

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Sıfır uzunluklu eşleşme döngüyü ilerletmezdi; savunma olarak atlanır.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > son) cikti.push(text.slice(son, m.index));
    const k = `${anahtar}-${sayac++}`;
    const g = m.groups ?? {};

    if (g.kod !== undefined) {
      cikti.push(<code key={k}>{g.kod.slice(1, -1)}</code>);
    } else if (g.kalin !== undefined) {
      cikti.push(<strong key={k}>{inline(g.kalin.slice(2, -2), k)}</strong>);
    } else if (g.italik !== undefined) {
      cikti.push(<em key={k}>{inline(g.italik.slice(1, -1), k)}</em>);
    } else if (g.uzerilmis !== undefined) {
      cikti.push(<del key={k}>{inline(g.uzerilmis.slice(2, -2), k)}</del>);
    } else if (g.baglanti !== undefined) {
      // `)` içeren adresleri de kapsasın diye en dıştaki parantez eşleşir.
      const uy = g.baglanti.match(/^\[([^\]]+)\]\(([\s\S]*)\)$/);
      const yazi = uy ? uy[1] : g.baglanti;
      const adres = uy ? uy[2] : "";
      const href = guvenliHref(adres);
      const govde = <>{inline(yazi, k)}</>;
      // Güvensiz şema (javascript:, data:) reddedilir; metin yine gösterilir.
      cikti.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {govde}
          </a>
        ) : (
          govde
        )
      );
    } else if (g.otomatik !== undefined) {
      const href = guvenliHref(g.otomatik);
      cikti.push(
        <a key={k} href={href ?? "#"} target="_blank" rel="noreferrer noopener">
          {g.otomatik}
        </a>
      );
    }
    son = m.index + m[0].length;
  }
  if (son < text.length) cikti.push(text.slice(son));
  return cikti;
}

/* ------------------------------------------------------------------ */
/* Kod bloğu                                                          */
/* ------------------------------------------------------------------ */

function KodBlogu({ dil, kod }: { dil: string; kod: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(kod);
      setKopyalandi(true);
      window.setTimeout(() => setKopyalandi(false), 1400);
    } catch {
      /* pano izni yoksa sessiz geç */
    }
  }

  return (
    <div className="md-kod">
      <div className="md-kod-bar">
        <span className="md-kod-dil">{dil}</span>
        <button type="button" onClick={kopyala} className="md-kod-kopyala">
          {kopyalandi ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      <pre>
        <code>{kod}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blok ayrıştırma                                                     */
/* ------------------------------------------------------------------ */

type Blok =
  | { tur: "kod"; dil: string; icerik: string }
  | { tur: "baslik"; seviye: number; icerik: string }
  | { tur: "liste"; sirali: boolean; ogeler: { seviye: number; metin: string }[] }
  | { tur: "alinti"; icerik: string }
  | { tur: "tablo"; baslik: string[]; satirlar: string[][] }
  | { tur: "cizgi" }
  | { tur: "paragraf"; icerik: string };

const BASLIK_RE = /^(\s*)(#{1,6})\s+(.*)$/;
const LISTE_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const ALINTI_RE = /^\s*>\s?(.*)$/;
const CIZGI_RE = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;
/** Kod bloğu açılışı.
 *
 *  Girintiye İZİN VERİLİYOR: model kod bloğunu madde içinde iki boşlukla
 *  girintileyerek yazıyor. Girintisiz eşleşme gerçek cevapta kod bloğunu
 *  satır içi `kod` gibi gösteriyordu (canlı cevapta ölçüldü). */
const KOD_ACILIS_RE = /^[ \t]*```([\w+#.-]*)[ \t]*$/;
/** Kapanış, açılıştan daha girintili olabilir. */
const KOD_KAPANIS_RE = /^[ \t]*```[ \t]*$/;

function hucreleriAyir(satir: string): string[] {
  return satir
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((h) => h.trim());
}

function ayristir(kaynak: string): Blok[] {
  const satirlar = kaynak.replace(/\r\n/g, "\n").split("\n");
  const bloklar: Blok[] = [];
  let i = 0;

  while (i < satirlar.length) {
    const satir = satirlar[i];

    // --- kod bloğu ---
    const kodAcilis = satir.match(KOD_ACILIS_RE);
    if (kodAcilis) {
      const girinti = (kodAcilis[0].match(/^[ \t]*/) || [""])[0].length;
      const dil = (satir.trim().match(/^```([\w+#.-]*)/) || [null, ""])[1] || "kod";
      const satirlarKod: string[] = [];
      i += 1;
      while (i < satirlar.length) {
        if (KOD_KAPANIS_RE.test(satirlar[i])) {
          // Yalnızca açılışla aynı ya da daha derin girintideki kapanış
          // gerçek kapanıştır; içerideki ``` satırı kapanmış sayılmaz.
          const kapanisGirinti = (satirlar[i].match(/^[ \t]*/) || [""])[0].length;
          if (kapanisGirinti >= girinti) {
            i += 1;
            break;
          }
        }
        satirlarKod.push(satirlar[i].slice(girinti));
        i += 1;
      }
      bloklar.push({ tur: "kod", dil, icerik: satirlarKod.join("\n") });
      continue;
    }

    // --- tablo ---
    if (
      /\|/.test(satir) &&
      i + 1 < satirlar.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(satirlar[i + 1]) &&
      satirlar[i + 1].includes("-")
    ) {
      const baslik = hucreleriAyir(satir);
      i += 2;
      const satirlarTablo: string[][] = [];
      while (i < satirlar.length && satirlar[i].includes("|") && satirlar[i].trim()) {
        satirlarTablo.push(hucreleriAyir(satirlar[i]));
        i += 1;
      }
      bloklar.push({ tur: "tablo", baslik, satirlar: satirlarTablo });
      continue;
    }

    // --- yatay çizgi ---
    if (CIZGI_RE.test(satir) && satir.trim().length >= 3) {
      bloklar.push({ tur: "cizgi" });
      i += 1;
      continue;
    }

    // --- başlık ---
    const baslik = satir.match(BASLIK_RE);
    if (baslik) {
      // `##` -> h2 (bir kayma vardı: h3 üretiyordu)
      bloklar.push({
        tur: "baslik",
        seviye: Math.min(baslik[2].length, 6),
        icerik: baslik[3],
      });
      i += 1;
      continue;
    }

    // --- alıntı ---
    if (ALINTI_RE.test(satir)) {
      const parcalar: string[] = [];
      while (i < satirlar.length && ALINTI_RE.test(satirlar[i])) {
        parcalar.push(satirlar[i].match(ALINTI_RE)![1]);
        i += 1;
      }
      bloklar.push({ tur: "alinti", icerik: parcalar.join(" ") });
      continue;
    }

    // --- liste ---
    const listeIlk = satir.match(LISTE_RE);
    if (listeIlk) {
      const sirali = /\d/.test(listeIlk[2]);
      const ogeler: { seviye: number; metin: string }[] = [];
      while (i < satirlar.length) {
        const m = satirlar[i].match(LISTE_RE);
        if (!m) {
          // Madde içindeki kod bloğu madde metnine karıştırılmaz:
          // girintili olsa bile ayrı blok olarak ele alınır.
          if (KOD_ACILIS_RE.test(satirlar[i])) break;
          // Maddeye devam eden satır (girintili)
          if (satirlar[i].trim() && ogeler.length && /^\s{2,}/.test(satirlar[i])) {
            ogeler[ogeler.length - 1].metin += " " + satirlar[i].trim();
            i += 1;
            continue;
          }
          break;
        }
        ogeler.push({ seviye: Math.floor(m[1].replace(/\t/g, "  ").length / 2), metin: m[3] });
        i += 1;
      }
      bloklar.push({ tur: "liste", sirali, ogeler });
      continue;
    }

    // --- boş satır ---
    if (!satir.trim()) {
      i += 1;
      continue;
    }

    // --- paragraf ---
    const parcalar: string[] = [];
    while (
      i < satirlar.length &&
      satirlar[i].trim() &&
      !KOD_ACILIS_RE.test(satirlar[i]) &&
      !BASLIK_RE.test(satirlar[i]) &&
      !LISTE_RE.test(satirlar[i]) &&
      !ALINTI_RE.test(satirlar[i])
    ) {
      parcalar.push(satirlar[i].trim());
      i += 1;
    }
    if (parcalar.length) bloklar.push({ tur: "paragraf", icerik: parcalar.join(" ") });
  }

  return bloklar;
}

/* ------------------------------------------------------------------ */
/* Bileşen                                                            */
/* ------------------------------------------------------------------ */

function ListeOgesi({
  seviye,
  metin,
  sirali,
  siraNo
}: {
  seviye: number;
  metin: string;
  sirali: boolean;
  siraNo: number;
}) {
  const ic = <>{inline(metin)}</>;
  if (seviye === 0) {
    return sirali ? <li value={siraNo}>{ic}</li> : <li>{ic}</li>;
  }
  return <li className="md-ic-alt">{ic}</li>;
}

export function Markdown({ children }: { children: string }) {
  const metin = children || "";
  // Yalnızca boşluktan ibaret girdi: boş kutu yerine hiçbir şey basma.
  if (!metin.trim()) return null;

  const bloklar = ayristir(metin);
  if (!bloklar.length) {
    return <p className="md-paragraf">{metin}</p>;
  }

  return (
    <div className="md">
      {bloklar.map((blok, idx) => {
        switch (blok.tur) {
          case "kod":
            return <KodBlogu key={idx} dil={blok.dil} kod={blok.icerik} />;

          case "baslik": {
            const Baslik = `h${blok.seviye}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            return (
              <Baslik key={idx} className="md-baslik">
                {inline(blok.icerik)}
              </Baslik>
            );
          }

          case "cizgi":
            return <hr key={idx} className="md-cizgi" />;

          case "alinti":
            return (
              <blockquote key={idx} className="md-alinti">
                {inline(blok.icerik)}
              </blockquote>
            );

          case "liste": {
            let sayac = 0;
            return blok.sirali ? (
              <ol key={idx} className="md-liste">
                {blok.ogeler.map((oge, j) => (
                  <ListeOgesi key={j} {...oge} sirali siraNo={++sayac} />
                ))}
              </ol>
            ) : (
              <ul key={idx} className="md-liste">
                {blok.ogeler.map((oge, j) => (
                  <ListeOgesi key={j} {...oge} sirali={false} siraNo={0} />
                ))}
              </ul>
            );
          }

          case "tablo":
            return (
              <div key={idx} className="md-tablo-sarmal">
                <table className="md-tablo">
                  <thead>
                    <tr>
                      {blok.baslik.map((h, j) => (
                        <th key={j}>{inline(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {blok.satirlar.map((satir, j) => (
                      <tr key={j}>
                        {satir.map((hücre, k) => (
                          <td key={k}>{inline(hücre)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "paragraf":
          default:
            return (
              <p key={idx} className="md-paragraf">
                {inline(blok.icerik)}
              </p>
            );
        }
      })}
    </div>
  );
}
