#!/usr/bin/env bash
# =============================================================================
#  UMAY — Kurulum betiği
# =============================================================================
#
#  Ne yapar:
#    1. Electron sandbox izinlerini düzeltir (Linux'ta ZORUNLU)
#    2. Bağımlılıkları kurar
#    3. Arayüzü derler
#    4. Uygulamayı başlatmaya hazır hale getirir
#
#  Kullanım:
#    cd umay/Umay/Web
#    bash kur.sh
#
#  Sık çıkan iki hata:
#
#    "The SUID sandbox helper binary was found, but is not configured
#     correctly"  ->  bu betik çözüyor (npm install bitini düşürüyor)
#
#    "Missing X server or $DISPLAY"  ->  masaüstünden çalıştır, terminali
#                                        kapatma
# =============================================================================

set -e

# Renkler (terminal destekliyorsa)
if [ -t 1 ]; then
    YESIL='\033[0;32m'; KIRMIZI='\033[0;31m'; SARI='\033[1;33m'
    MAVI='\033[0;36m'; SIFIR='\033[0m'
else
    YESIL=''; KIRMIZI=''; SARI=''; MAVI=''; SIFIR=''
fi

ok()   { echo -e "${YESIL}  ✓${SIFIR} $1"; }
hata() { echo -e "${KIRMIZI}  ✗${SIFIR} $1"; }
bilgi() { echo -e "${MAVI}  →${SIFIR} $1"; }
uyari() { echo -e "${SARI}  !${SIFIR} $1"; }

# Neredeyiz?
KONUM="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "═══════════════════════════════════════════"
echo "  UMAY — Kurulum"
echo "═══════════════════════════════════════════"
echo "  Konum: $KONUM"
echo ""

# --- 1. İşletim sistemi -----------------------------------------------------
echo "── 1/5  Sistem kontrolü"

case "$(uname -s)" in
    Linux)  SISTEM="Linux" ;;
    Darwin) SISTEM="macOS" ;;
    MINGW*|MSYS*|CYGWIN*) SISTEM="Windows" ;;
    *)      SISTEM="bilinmiyor" ;;
esac

if ! command -v node >/dev/null 2>&1; then
    hata "Node.js bulunamadı."
    echo "     Ubuntu: sudo apt install nodejs npm"
    echo "     macOS : brew install node"
    exit 1
fi

NODE_SURUM="$(node --version)"
NODE_ANA=$(echo "$NODE_SURUM" | sed 's/v//' | cut -d. -f1)
if [ "$NODE_ANA" -lt 22 ]; then
    hata "Node.js $NODE_SURUM çok eski. En az 22 gerekiyor."
    exit 1
fi
ok "$SISTEM · Node.js $NODE_SURUM · npm $(npm --version)"
echo ""

# --- 2. Grafik ortam (Electron masaüstü ister) --------------------------------
echo "── 2/5  Grafik ortam"

if [ "$SISTEM" = "Linux" ]; then
    if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
        uyari "Masaüstü oturumu yok (DISPLAY/WAYLAND_DISPLAY boş)."
        uyari "Bu betiği MASAÜSTÜNDE açılan bir terminalden çalıştır."
        uyari "Terminal kapatırsan uygulama da kapanır."
    else
        if [ -n "${WAYLAND_DISPLAY:-}" ]; then
            ok "Wayland oturumu bulundu"
        else
            ok "X11 oturumu bulundu"
        fi
    fi
else
    ok "Masaüstü ortamı"
fi
echo ""

# --- 3. Bağımlılıklar -------------------------------------------------------
echo "── 3/5  Bağımlılıklar kuruluyor"

# Sahiplik düzeltmesi — `npm install` ÖNCESİ çalışmalı
#
# BELİRTİ (2026-10-05): kurulumda şu hata ölçüldü:
#
#   ✗ Bağımlılık kurulumu başarısız.        (node_modules root'a aitken)
#   EACCES: permission denied, unlink 'dist/assets/index-....css'
#
# Sebebi: `dist/` ve `node_modules/` içindeki dosyaların bir kısmı
# root'a ait. npm ve Vite bunları değiştiremez/silemez.
#
# NEDEN root'a ait olduğunu bilmiyoruz. Bu betiğin kendi yaptığı
# `chown` yalnızca `node_modules/electron/dist/chrome-sandbox`
# dosyasına dokunuyor; `Umay/Web/dist` ile karıştırılmamalı.
# Muhtemel neden daha önce `sudo` ile çalıştırılmış bir `npm` komutu.
# Sebebi doğrulayamadık; bu yüzden belirtiyi düzeltiyoruz.
#
# NEDEN BURADA, DERLEME ÖNCESİ DEĞİL
#
# Ölçüldü: `node_modules` root'a aitken `npm install` zaten
# başarısız oluyor. Düzeltme derlemeden sonra gelirse kurulum
# adım 3'te ölüyor. Bu yüzden bağımlılık kurulumundan önce çalışıyor
# ve hem `npm install`'ı hem derlemeyi koruyor.
#
# TESPİT NEDEN `-w` DEĞİL
#
# Dizin sahibi kullanıcıya aitse ama içindeki dosyalar root'a aitse
# `[ -w dizin ]` TRUE döner (üstüne yazılabilir) ama Vite'in silmesi
# yine de EACCES verir. Bu sessiz hatayı önlemek için asıl sinyali
# kullanıyoruz: sahiplik (`find ! -user`).
#
# HIZ
#
# `node_modules/` on binlerce dosya içerir. Yalnızca gerçekten yabancı
# sahipli dosya varsa `chown -R` çalıştırıyoruz, her seferinde değil.
# İlk taramada `find ... -quit` yalnızca tek dosya bulup durur.
if [ "$(id -u)" != "0" ]; then SUDO="sudo"; else SUDO=""; fi
BEN="$(id -un):$(id -gn)"

sahipli_duzelt() {
    yol="$1"

    # Klasör yoksa (taze klon) sorun yok.
    [ -d "$yol" ] || return 0

    # İlk dosya bile kullanıcıya aitse sorun yok, chown'a gerek yok.
    if [ -z "$(find "$yol" ! -user "$(id -un)" -print -quit 2>/dev/null)" ]; then
        return 0
    fi

    bilgi "$yol/ içinde root'a ait dosyalar var, düzeltiliyor..."
    $SUDO chown -R "$BEN" "$yol" 2>/dev/null || true

    if [ -z "$(find "$yol" ! -user "$(id -un)" -print -quit 2>/dev/null)" ]; then
        ok "$yol/ düzeltildi"
        return 0
    fi

    hata "$yol/ düzeltilemedi. Elle deneyin:"
    echo "     sudo chown -R \$USER:\$USER $yol"
    return 1
}

sahipli_duzelt "node_modules"
sahipli_duzelt "dist"

# Electron'un postinstall'ı npm 11+'da varsayılan engellenir.
# Bu yüzden betiği elle çalıştıracağız.
UMAY_SANDBOX_SKIP=1 npm install --no-audit --no-fund || {
    hata "Bağımlılık kurulumu başarısız."
    echo ""
    bilgi "EACCES (permission denied) aldıysanız:"
    echo "     sudo chown -R \$USER:\$USER node_modules dist"
    echo "     bash kur.sh"
    exit 1
}
ok "npm install tamam"

# Electron binary'si indirilmemiş olabilir (postinstall engellendi)
if [ ! -f "node_modules/electron/dist/electron" ]; then
    bilgi "Electron indiriliyor (postinstall atlandı)..."
    node node_modules/electron/install.js 2>/dev/null || {
        hata "Electron indirilemedi."
        hata "Elle deneyin:  node node_modules/electron/install.js"
        exit 1
    }
    ok "Electron indirildi"
fi
echo ""

# --- 4. Sandbox izinleri -----------------------------------------------------
echo "── 4/5  Electron sandbox izinleri"

if [ "$SISTEM" = "Linux" ]; then
    SANDBOX="node_modules/electron/dist/chrome-sandbox"

    if [ ! -f "$SANDBOX" ]; then
        uyari "chrome-sandbox bulunamadı, atlanıyor"
    else
        IZIN=$(stat -c '%a' "$SANDBOX" 2>/dev/null || echo "000")

        if [ "$IZIN" = "4755" ]; then
            ok "sandbox zaten doğru (4755)"
        else
            bilgi "sandbox izni $IZIN, 4755 yapılıyor..."
            SUDO=""
            if [ "$(id -u)" != "0" ]; then SUDO="sudo"; fi

            $SUDO chown root:root "$SANDBOX" 2>/dev/null
            $SUDO chmod 4755 "$SANDBOX" 2>/dev/null

            YENI=$(stat -c '%a' "$SANDBOX" 2>/dev/null || echo "000")
            if [ "$YENI" = "4755" ]; then
                ok "sandbox düzeltildi (4755)"
            else
                hata "Düzeltilemedi. Elle deneyin:"
                echo "     sudo chown root:root node_modules/electron/dist/chrome-sandbox"
                echo "     sudo chmod 4755 node_modules/electron/dist/chrome-sandbox"
                echo ""
                uyari "Bu olmadan uygulama başlamaz. Yukarıdaki iki komutu çalıştırıp tekrar deneyin."
            fi
        fi
    fi
else
    ok "Linux dışı — gerekli değil"
fi
echo ""

# --- 5. Arayüz derleme --------------------------------------------------------
echo "── 5/5  Arayüz derleniyor"

# Sahiplik burada DÜZELTİLMİYOR — adım 3'te, `npm install`'dan önce
# yapıldı. Adım 3, `node_modules`'a yazmak zorunda; düzeltme orada
# olmazsa kurulum daha ilk adımda ölüyor.
if ! npm run build; then
    hata "Derleme başarısız."
    echo ""
    bilgi "EACCES (permission denied) aldıysanız:"
    echo "     sudo chown -R \$USER:\$USER dist node_modules"
    echo "     bash kur.sh"
    exit 1
fi
ok "derlendi (dist/)"

# --- Hazır --------------------------------------------------------------------
echo ""
echo "═══════════════════════════════════════════"
echo -e "${YESIL}  Kurulum tamam.${SIFIR}"
echo "═══════════════════════════════════════════"
echo ""
echo "  Başlatmak için:"
echo -e "    ${MAVI}npm run uygulama${SIFIR}"
echo ""
echo "  İlk açılışta:"
echo "    • Ekranda giriş ekranı çıkar — e-posta ve şifre ile giriş yap"
echo "    • Sağ üstteki 'Bilgisayar' panelini aç"
echo "    • 'Ekranı gör' ve 'Fare' yeşil olmalı"
echo ""
echo "  Fare/ekran yeşil değilse:"
echo -e "    ${MAVI}bash tani.sh${SIFIR}    ← eksik olanı söyler ve kurulum komutunu verir"
echo ""
echo "  Bilinen: Wayland oturumunda xdotool ÇALIŞMAZ (X11'e bağlıdır)."
echo "  Umay 'Fare' için Wayland'a özgü araç arar; bulunamazsa panel"
echo "  kırmızı gösterir ve nedenini yazar. Bu bir hata değil, eksik"
echo "  sistem aracı — tani.sh kurulum komutunu verir."
echo ""
echo "  Uygulama arka planda kalır — bu terminali kapatma."
echo ""
echo "  Kapatma: sağ üst köşeden veya terminalden Ctrl+C"
echo ""