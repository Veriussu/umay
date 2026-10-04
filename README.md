# Umay

Yapay zeka asistanı — işletim sisteminde çalışan masaüstü uygulaması.

Umay; sohbet eder, hafıza tutar, araştırma yapar ve **bilgisayarını
gerçekten kullanır** — ekranı görür, fareyi oynatır, klavyeyi kullanır,
terminalde komut çalıştırır.

## Nasıl çalışır

```
┌─ SUNUCU (backend) ──────────┐        ┌─ BU UYGULAMA ───────────────┐
│ ajan kodları (gizli)        │        │ ekranı gör                  │
│ model çağrıları             │◄──────►│ fare / klavye               │
│ API anahtarları (gizli)     │  API   │ terminal / dosya            │
│ sohbet, hafıza, veri        │        │ oyun / medya                │
│ paket ve limitler           │        │                              │
└─────────────────────────────┘        └──────────────────────────────┘
```

Sunucu **karar verir**, bu uygulama **yapar**. Kodun ve anahtarların
kullanıcının bilgisayarda olmaz.

## Kurulum

### Ubuntu

```bash
npm install        # Electron indirir, sandbox izinlerini düzeltir
npm run build
npm run uygulama
```

**İlk kurulumda şifre sorulabilir** — `npm install` sonunda çalışan
sandbox düzeltmesi `sudo` ister. Bu normaldir.

Elle düzeltmek gerekirse:

```bash
npm run sandbox:duzelt
```

Bu komut şunu yapar ve uygulama ancak bundan sonra başlar:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Neden gerekli: `npm install` her çalıştığında bu dosyanın `setuid`
bitini düşürüyor. Bit olmadan Electron güvenlikten ödün vermeyi
reddeder ve uygulamayı başlatmaz. `postinstall` betiği bunu
otomatik düzeltir.

### Paket oluşturma

```bash
npm run paket:linux    # AppImage + .deb
npm run paket:mac      # .dmg
npm run paket:win      # .nsis + portable
```

Çıktılar `release/` klasörüne düşer. Paketlenmiş uygulamalarda sandbox
sorunu olmaz — `electron-builder` doğru izinlerle paketler.

## İlk çalıştırma

1. Uygulamayı aç
2. **Bilgisayar** panelinde "ekranı gör" ve "fare" yeşil olmalı
3. Sunucu adresi sorulacak — `https://backendu.veriussu.com/api/v1`

Panelde yetenekler açıkça listelenir. Bir yetenek kapalıysa **nedeni
yazılıdır** — sessizce başarısız olmaz.

### Wayland kullanıcıları (KDE, GNOME Wayland)

İlk fare/ekran kullanımında sistem izin ister. İzin verilmezse fare ve
ekran çalışmaz; terminal ve klavye çalışmaya devam eder. Panel bunu
"fare kullanılamıyor" diye açıkça söyler.

X11 oturumlarında ek izne gerek yoktur.

## Geliştirme

```bash
npm run dev        # arayüzü 9056'da çalıştır (tarayıcı modu)
npm run typecheck  # tip kontrolü
npm test           # Bridge testleri
```

### Mimari

```
electron/main.cjs       ana süreç — OS'a dokunan TEK yer
electron/preload.cjs    güvenli köprü (arayüz Node'a erişemez)
src/lib/umayDesktop.ts  arayüzün köprüye erişimi (tek giriş noktası)
src/BilgisayarPaneli.tsx  yetenek gösterimi
../Bridge/src/          işletim sistemi komutları (mevcut kod, değiştirilmedi)
```

Bridge Node.js üzerinde çalışır; Electron da Node.js üzerinde çalıştığı
için ikisi aynı kod tabanını paylaşır.

## Güvenlik

- Arayüz (`renderer`) Node.js'e erişemez
- OS komutları yalnız ana süreçte çalışır
- Şifreler `~/.umay/ayarlar.json` dosyasında tutulur

## Lisans

Özel kullanım.