#!/usr/bin/env bash
# =============================================================================
#  UMAY — Ortam tanısı
# =============================================================================
#
#  Ne yapar:
#    Fare ve ekran kontrolünün çalışıp çalışmayacağını ÖLÇER.
#    Tahmin etmez, gerçek durumu yazar.
#
#  Kullanım:
#    cd umay/Umay/Web
#    bash tani.sh
#
#  Çıktıyı tam olarak kopyalayıp gönder. Eksik olan her şey
#  kurulum komutuyla birlikte listelenir.
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  UMAY — Ortam Tanısı"
echo "═══════════════════════════════════════════════════════"
echo ""

# --- 1. İşletim sistemi -----------------------------------------------------
echo "── 1. İşletim sistemi"
echo "   çekirdek : $(uname -r)"
echo "   dağıtım  : $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
echo ""

# --- 2. Grafik oturumu ------------------------------------------------------
echo "── 2. Grafik oturumu"
echo "   DISPLAY         : ${DISPLAY:-boş}"
echo "   WAYLAND_DISPLAY : ${WAYLAND_DISPLAY:-boş}"
echo "   XDG_SESSION_TYPE: ${XDG_SESSION_TYPE:-boş}"
echo "   XDG_CURRENT_DESKTOP: ${XDG_CURRENT_DESKTOP:-boş}"
echo "   DESKTOP_SESSION : ${DESKTOP_SESSION:-boş}"
echo ""

# Hangi oturum? Bridge'in de kullandığı mantık
OTURUM="bilinmiyor"
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
    OTURUM="Wayland"
elif [ -n "${DISPLAY:-}" ]; then
    OTURUM="X11"
fi
echo "   → Bridge bu oturumu şöyle görecek: $OTURUM"
echo ""

# --- 3. Masaüstü ortamı ----------------------------------------------------
# Wayland'da hangi araç gerektiği masaüstüne bağlı. Bu yüzden
# masaüstünü ayrıca soruyoruz.
MASAUSTU="${XDG_CURRENT_DESKTOP:-${DESKTOP_SESSION:-}}"
MASAUSTU_KUCUK="$(echo "$MASAUSTU" | tr 'A-Z' 'a-z')"
echo "   masaüstü: ${MASAUSTU:-bulunamadı}"
case "$MASAUSTU_KUCUK" in
    *gnome*)   echo "   → GNOME. Ekran: gnome-screenshot. Fare: ydotool (yoksa kur)." ;;
    *kde*|*plasma*) echo "   → KDE Plasma. Ekran: spectacle. Fare: ydotool (yoksa kur)." ;;
    *sway*)    echo "   → Sway/wlroots. Ekran: grim. Fare: ydotool (yoksa kur)." ;;
    *xfce*)    echo "   → XFCE. Ekran: xfce4-screenshooter. Fare: ydotool." ;;
    *mate*)    echo "   → MATE. Ekran: gnome-screenshot. Fare: ydotool." ;;
    *)         echo "   → Tanınmayan masaüstü. Aşağıdaki kurulum listesine bak." ;;
esac
echo ""

# --- 4. Araç kontrolü -------------------------------------------------------
# Her araç için: kurulu mu, sürümü ne, sadece var mı yok mu.
echo "── 4. Fare kontrolü araçları"
echo "   (Wayland'da xdotool ÇALIŞMAZ. X11'e bağlıdır.)"
printf "   %-14s %-8s %s\n" "ARAÇ" "DURUM" "NOT"
printf "   %-14s %-8s %s\n" "xdotool"  "$(command -v xdotool  >/dev/null && echo VAR || echo yok)"  "yalnız X11"
printf "   %-14s %-8s %s\n" "ydotool"  "$(command -v ydotool  >/dev/null && echo VAR || echo yok)"  "Wayland + /dev/uinput"
printf "   %-14s %-8s %s\n" "dotool"   "$(command -v dotool   >/dev/null && echo VAR || echo yok)"  "wlroots/Sway"
printf "   %-14s %-8s %s\n" "wtype"    "$(command -v wtype    >/dev/null && echo VAR || echo yok)"  "sadece klavye"
printf "   %-14s %-8s %s\n" "wlrctl"   "$(command -v wlrctl   >/dev/null && echo VAR || echo yok)"  "sadece wlroots"
echo ""

echo "── 5. Ekran görüntüsü araçları"
printf "   %-20s %-8s %s\n" "ARAÇ" "DURUM" "NOT"
printf "   %-20s %-8s %s\n" "gnome-screenshot" "$(command -v gnome-screenshot >/dev/null && echo VAR || echo yok)" "GNOME"
printf "   %-20s %-8s %s\n" "spectacle"         "$(command -v spectacle         >/dev/null && echo VAR || echo yok)" "KDE"
printf "   %-20s %-8s %s\n" "grim"              "$(command -v grim              >/dev/null && echo VAR || echo yok)" "wlroots/Sway"
printf "   %-20s %-8s %s\n" "scrot"             "$(command -v scrot             >/dev/null && echo VAR || echo yok)" "yalnız X11"
printf "   %-20s %-8s %s\n" "maim"              "$(command -v maim              >/dev/null && echo VAR || echo yok)" "yalnız X11"
printf "   %-20s %-8s %s\n" "xfce4-screenshooter" "$(command -v xfce4-screenshooter >/dev/null && echo VAR || echo yok)" "XFCE"
echo ""

# --- 6. /dev/uinput ---------------------------------------------------------
# ydotool'ün çalışması için bu aygıta yazma yetkisi şart. Olmazsa fare
# kontrolü sessizce başarısız olur.
echo "── 6. /dev/uinput (fare kontrolü için gerekli)"
if [ -e /dev/uinput ]; then
    echo "   aygıt     : VAR"
    if [ -r /dev/uinput ] && [ -w /dev/uinput ]; then
        echo "   erişim    : TAM (okuma+yazma)"
    else
        echo "   erişim    : EKSİK — fare kontrolü çalışmaz"
        echo "   geçici çözüm (yeniden başlatınca silinir):"
        echo "     sudo modprobe uinput"
    fi
else
    echo "   aygıt     : YOK — fare kontrolü çalışmaz"
    echo "   geçici çözüm (yeniden başlatınca silinir):"
    echo "     sudo modprobe uinput"
fi
echo ""

# --- 7. Kullanıcı grupları --------------------------------------------------
# ydotool için kullanıcının 'input' grubunda olması gerekiyor.
echo "── 7. Kullanıcı grupları"
echo "   kullanıcı: $(id -un)"
echo "   gruplar  : $(id -Gn)"
GRUPLAR="$(id -Gn)"
if echo "$GRUPLAR" | tr ' ' '\n' | grep -qx "input"; then
    echo "   input grubu: VAR ✓"
else
    echo "   input grubu: YOK — ydotool kurulsa bile çalışmaz"
fi
echo ""

# --- 8. Electron'ın ihtiyaç duyduğu kütüphaneler ----------------------------
# Wayland + Electron bazı GNOME/KDE kütüphanelerini arar. Eksikse
# pencere açılır ama bozuk çizilir.
echo "── 8. Grafik kütüphaneleri (Electron'un aradığı)"
for KUT in libgtk-3.so.0 libnotify.so.4 libnss3.so libxss.so.1 libxtst.so.6 libgbm.so.1 libdrm.so.2 libasound.so.2; do
    if ldconfig -p 2>/dev/null | grep -q "$KUT"; then
        printf "   %-20s %s\n" "$KUT" "VAR"
    else
        printf "   %-20s %s\n" "$KUT" "YOK"
    fi
done
echo ""

# --- Sonuç -------------------------------------------------------------------
echo "═══════════════════════════════════════════════════════"
echo "  Sonuç"
echo "═══════════════════════════════════════════════════════"
echo ""

EKRAN_ARACI="yok"
case "$MASAUSTU_KUCUK" in
    *gnome*) command -v gnome-screenshot >/dev/null && EKRAN_ARACI="gnome-screenshot" ;;
    *kde*|*plasma*) command -v spectacle >/dev/null && EKRAN_ARACI="spectacle" ;;
    *sway*) command -v grim >/dev/null && EKRAN_ARACI="grim" ;;
    *xfce*) command -v xfce4-screenshooter >/dev/null && EKRAN_ARACI="xfce4-screenshooter" ;;
esac

FARE_ARACI="yok"
if [ "$OTURUM" = "X11" ]; then
    command -v xdotool >/dev/null && FARE_ARACI="xdotool"
elif command -v ydotool >/dev/null; then
    FARE_ARACI="ydotool"
elif command -v dotool >/dev/null; then
    FARE_ARACI="dotool"
fi

echo "   Oturum           : $OTURUM"
echo "   Fare aracı       : $FARE_ARACI"
echo "   Ekran aracı      : $EKRAN_ARACI"
echo ""

if [ "$FARE_ARACI" = "yok" ]; then
    echo "   ✗ FARE KONTROLÜ YOK"
    echo ""
    echo "     Kurulum:"
    if [ "$OTURUM" = "Wayland" ]; then
        echo "       sudo apt install ydotool"
        echo "       sudo modprobe uinput"
        echo "       sudo usermod -aG input $USER   # çıkış-giriş gerekir"
    else
        echo "       sudo apt install xdotool"
    fi
    echo ""
fi

if [ "$EKRAN_ARACI" = "yok" ]; then
    echo "   ✗ EKRAN GÖRÜNTÜSÜ YOK"
    echo ""
    echo "     Kurulum:"
    case "$MASAUSTU_KUCUK" in
        *gnome*)   echo "       sudo apt install gnome-screenshot" ;;
        *kde*|*plasma*) echo "       sudo apt install spectacle" ;;
        *sway*)    echo "       sudo apt install grim" ;;
        *xfce*)    echo "       sudo apt install xfce4-screenshooter" ;;
        *)         echo "       Masaüstü tespit edilemedi. Şunlardan birini kur:" ;;
    esac
    if ! echo "$MASAUSTU_KUCUK" | grep -qE "gnome|kde|plasma|sway|xfce|mate"; then
        echo "       sudo apt install grim gnome-screenshot"
    fi
    echo ""
fi

if [ "$FARE_ARACI" != "yok" ] && [ "$EKRAN_ARACI" != "yok" ]; then
    echo "   ✓ İKİSİ DE VAR — Umay fare ve ekranı kullanabilir"
    echo ""
fi

echo "  Bu çıktının tamamını kopyalayıp gönder."
echo ""