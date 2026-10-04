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

### Tek komut (tüm işletim sistemleri)

```bash
git clone https://github.com/Veriussu/umay.git
cd umay/Umay/Web
bash kur.sh
npm run uygulama
```

`kur.sh` her şeyi yapar:

- Node.js sürümünü kontrol eder (22+ gerekir)
- Grafik oturumu var mı bakar
- Bağımlılıkları kurar
- Electron'u indirir (npm 11 kurulum betiklerini engellediği için
  elle indirir)
- **sandbox izinlerini düzeltir** (Linux'ta zorunlu)
- Arayüzü derler

İlk kurulumda şifre sorabilir — bu normaldir (sandbox düzeltmesi
`sudo` ister).

### Elle kurulum

```bash
npm install
npm run build
npm run uygulama
```

Bu yol **sandbox hatası verir**. Çözümü:

```bash
npm run sandbox:duzelt
```

### Sık çıkan hata: sandbox

```
The SUID sandbox helper binary was found, but is not configured correctly
```

`npm install`, Electron'un `chrome-sandbox` dosyasındaki `setuid`
bitini düşürüyor. Bit olmadan Electron güvenlikten ödün vermeyi
reddeder ve uygulamayı **başlatmaz**. `kur.sh` bunu otomatik
çözer; elle çalışıyorsan:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

### Sık çıkan hata: EACCES (permission denied)

```
EACCES: permission denied, unlink 'dist/assets/index-....css'
```

`dist/` veya `node_modules/` içindeki dosyaların bir kısmı `root`'a
ait. `npm` ve `vite` bunları silemez/değiştiremez. `kur.sh` bunu
`npm install`'dan **önce** otomatik düzeltir; elle çalışıyorsan:

```bash
sudo chown -R $USER:$USER dist node_modules
bash kur.sh
```

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