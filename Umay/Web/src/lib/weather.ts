// Hava durumu servisi — Open-Meteo API (anahtar gerektirmez) + tarayıcı konumu.
// Konum izni verilmezse İstanbul referans noktası kullanılır.

export type WeatherNow = {
  temperature: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  code: number;
  isDay: boolean;
  place: string;
};

const WMO_LABELS: Record<number, string> = {
  0: "Açık",
  1: "Az bulutlu",
  2: "Parçalı bulutlu",
  3: "Kapalı",
  45: "Puslu",
  48: "Kırağılı pus",
  51: "Hafif çisenti",
  53: "Çisenti",
  55: "Yoğun çisenti",
  56: "Donma çisintisi",
  57: "Yoğun donma çisintisi",
  61: "Hafif yağmur",
  63: "Yağmurlu",
  65: "Şiddetli yağmur",
  66: "Donma yağmuru",
  67: "Şiddetli donma yağmuru",
  71: "Hafif kar",
  73: "Kar yağışlı",
  75: "Yoğun kar",
  77: "Kar taneleri",
  80: "Hafif sağanak",
  81: "Sağanak yağış",
  82: "Şiddetli sağanak",
  85: "Kar sağanağı",
  86: "Yoğun kar sağanağı",
  95: "Gök gürültülü fırtına",
  96: "Dolulu fırtına",
  99: "Şiddetli dolulu fırtına"
};

export function weatherLabel(code: number) {
  return WMO_LABELS[code] ?? "Bilinmiyor";
}

/** Duruma göre renk sınıfı (styles.css içinde) */
export function weatherIconClass(code: number, isDay: boolean) {
  if (code === 0) return isDay ? "w-clear-day" : "w-clear-night";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "w-snow";
  if (code >= 95) return "w-storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "w-rain";
  if (code === 3 || code === 45 || code === 48) return "w-cloud";
  return "w-partly";
}

/** Duruma göre basit glif */
export function weatherGlyph(code: number, isDay: boolean) {
  if (code === 0) return isDay ? "☀" : "☾";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄";
  if (code >= 95) return "⛈";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧";
  if (code === 3 || code === 45 || code === 48) return "☁";
  return isDay ? "⛅" : "☁";
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`
    );
    if (!res.ok) return "Konum";
    const data: { city?: string; locality?: string; principalSubdivision?: string; countryName?: string } = await res.json();
    return data.city || data.locality || data.principalSubdivision || data.countryName || "Konum";
  } catch {
    return "Konum";
  }
}

async function fetchWeather(lat: number, lon: number, place: string): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Hava durumu alınamadı");
  const data = await res.json();
  const current = data.current || {};
  return {
    temperature: current.temperature_2m ?? null,
    apparent: current.apparent_temperature ?? null,
    humidity: current.relative_humidity_2m ?? null,
    windSpeed: current.wind_speed_10m ?? null,
    code: current.weather_code ?? 0,
    isDay: current.is_day === 1,
    place
  };
}

export async function loadLocalWeather(): Promise<WeatherNow> {
  const fallback = { lat: 41.0082, lon: 28.9784, place: "İstanbul" };
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("geolocation yok"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 15 * 60_000
      });
    });
    const { latitude, longitude } = position.coords;
    const place = await reverseGeocode(latitude, longitude);
    return await fetchWeather(latitude, longitude, place);
  } catch {
    return await fetchWeather(fallback.lat, fallback.lon, fallback.place);
  }
}
