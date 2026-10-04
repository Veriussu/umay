import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { API_BASE_URL } from "./api";

/* ============================================================================
   MARKA/BİRİM AYARLARI (branding)
   Admin panelde "branding" grubuna yüklenen logolar buradan, kategoriye göre
   okunur. Uç nokta public olduğu için token gerekmez — login/kayıt sayfasında
   da çalışır. Kayıtlar localStorage'da (30 dk TTL) önbelleğe alınır.
   ============================================================================ */

export type BrandingSet = {
  logo_url: string;
  favicon_url: string;
  mobile_logo_url: string;
  white_logo_url: string;
  black_logo_url: string;
};

export type PublicSettings = {
  branding?: BrandingSet;
  domain?: { domain_url?: string; site_name?: string; site_description?: string };
  legal?: Record<string, string>;
  seo?: { title?: string; description?: string; keywords?: string[]; og_image?: string };
};

export type BrandCategory = "logo" | "white" | "black" | "mobile" | "favicon";

const CACHE_KEY = "umay_public_settings_v1";
const CACHE_TTL = 1000 * 60 * 30; /* 30 dakika */

let memory: PublicSettings | null = null;
let inflight: Promise<PublicSettings | null> | null = null;

export function cachedSettings(): PublicSettings | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; data: PublicSettings };
      if (parsed.data && Date.now() - parsed.at < CACHE_TTL) {
        memory = parsed.data;
        return memory;
      }
    }
  } catch {
    /* bozuk önbellek yok sayılır */
  }
  return null;
}

export function loadPublicSettings(force = false): Promise<PublicSettings | null> {
  if (!force && memory) return Promise.resolve(memory);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_BASE_URL}/system-settings/public`, { signal: controller.signal });
      window.clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PublicSettings;
      memory = data;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
      } catch {
        /* depolama dolu olabilir */
      }
      return data;
    } catch {
      return cachedSettings();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/* --- Kategoriye göre logo seçimi (boş olanlar anlamlı sırayla elenir) --- */

const FALLBACK_ORDER: Record<BrandCategory, Array<keyof BrandingSet>> = {
  favicon: ["favicon_url"],
  logo: ["logo_url", "white_logo_url", "mobile_logo_url"],
  white: ["white_logo_url", "logo_url"],
  black: ["black_logo_url", "logo_url"],
  mobile: ["mobile_logo_url", "logo_url"]
};

export function pickBrandUrl(branding: BrandingSet | null | undefined, category: BrandCategory): string {
  if (!branding) return "";
  for (const key of FALLBACK_ORDER[category]) {
    if (branding[key]) return branding[key];
  }
  return "";
}

/* --- Göreli asset yollarını API orijinine çözümle (/uploads/... → backend) --- */

export function resolveAssetUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(data|blob):/i.test(url)) return url;
  if (url.startsWith("/")) {
    try {
      return new URL(url, API_BASE_URL).toString();
    } catch {
      return url;
    }
  }
  return url;
}

/* --- Favicon + sayfa başlığı + og:image uygulama --- */

export function applyBranding(settings: PublicSettings) {
  const favicon = settings.branding?.favicon_url || "";
  if (favicon) {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = resolveAssetUrl(favicon);
  }

  const title = settings.seo?.title || settings.domain?.site_name || "Umay";
  if (document.title && document.title !== title) document.title = title;

  const ogImage = settings.seo?.og_image || "";
  if (ogImage) {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("property", "og:image");
      document.head.appendChild(meta);
    }
    meta.content = resolveAssetUrl(ogImage);
  }
}

/* --- React: güncel logoları sağlayan kanca --- */

export function useBranding(): BrandingSet | null {
  const [branding, setBranding] = useState<BrandingSet | null>(() => cachedSettings()?.branding ?? null);
  useEffect(() => {
    let active = true;
    loadPublicSettings().then((settings) => {
      if (active && settings?.branding) setBranding(settings.branding);
    });
    return () => {
      active = false;
    };
  }, []);
  return branding;
}

/* --- React: kategoriye göre logo bileşeni (yoksa fallback çizer) --- */

export function BrandLogo({
  category = "logo",
  className = "",
  imgClassName = "",
  style,
  fallback = null
}: {
  category?: BrandCategory;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  fallback?: ReactNode;
}) {
  const branding = useBranding();
  const url = pickBrandUrl(branding, category);
  if (!url) return <>{fallback}</>;
  return (
    <picture className={className} style={style}>
      <img className={imgClassName} src={resolveAssetUrl(url)} alt="Umay" draggable={false} />
    </picture>
  );
}