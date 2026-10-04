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

# Electron'un postinstall'ı npm 11+'da varsayılan engellenir.
# Bu yüzden betiği elle çalıştıracağız.
UMAY_SANDBOX_SKIP=1 npm install --no-audit --no-fund || {
    hata "Bağımlılık kurulumu başarısız."
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

npm run build || {
    hata "Derleme başarısız."
    exit 1
}
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
echo "    • 'Bilgisayar' panelini aç"
echo "    • 'Ekranı gör' ve 'Fare' yeşil olmalı"
echo ""
echo "  Uygulama arka planda kalır — bu terminali kapatma."
echo ""
echo "  Sık karşılaşılan durumlar:"
echo "    Wayland + izin   → fare/ekran için sistem izni ister"
echo "    Fare çalışmıyor  → 'Bilgisayar' panelinde nedeni yazılıdır"
echo "    Kapatma          → sağ üst köşeden veya terminalden Ctrl+C"
echo ""