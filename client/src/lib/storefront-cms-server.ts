import { headers } from "next/headers";
import { resellerHostFromHeaders } from "@/lib/storefront-host";
import type { StorefrontSite } from "@/lib/storefront-cms";
import { defaultStorefrontSite } from "@/lib/storefront-cms";

function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

export async function fetchPublicStorefrontSite(
  domain: string | null,
  brandName?: string | null,
): Promise<StorefrontSite> {
  const fallback = defaultStorefrontSite(brandName || "Our Jewellery");
  const d = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (!d) return fallback;
  try {
    const res = await fetch(
      `${apiBase()}/api/public/storefront-page?domain=${encodeURIComponent(d)}`,
      { next: { revalidate: 30 } },
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      site?: StorefrontSite;
      storefront_website_enabled?: boolean;
    };
    if (!data?.storefront_website_enabled) return fallback;
    if (data?.site && typeof data.site === "object") return data.site;
    return fallback;
  } catch {
    return fallback;
  }
}

export async function getStorefrontSiteFromHeaders(
  brandName?: string | null,
): Promise<{ site: StorefrontSite; domain: string | null }> {
  const h = await headers();
  const domain = resellerHostFromHeaders(h.get("host"), h.get("x-custom-domain"));
  const site = await fetchPublicStorefrontSite(domain, brandName);
  return { site, domain };
}
