import { DEFAULT_SITE_URL, getSiteUrl } from "@/lib/site";

const FALLBACK_STORE_HOSTS = [
  "kcjewellers.co.in",
  "www.kcjewellers.co.in",
  "localhost",
  "127.0.0.1",
];

/** Hostnames treated as the main storefront — sharing stays on NEXT_PUBLIC_SITE_URL unless reseller overrides. */
export function getDefaultStoreHostnameSet(): Set<string> {
  const hosts = new Set<string>(FALLBACK_STORE_HOSTS.map((h) => h.toLowerCase()));
  for (const raw of [DEFAULT_SITE_URL, process.env.NEXT_PUBLIC_SITE_URL?.trim() || ""]) {
    if (!raw) continue;
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      hosts.add(u.hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

export function normalizeResellerDomain(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const d = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0]
    .toLowerCase();
  return d || null;
}

export type CatalogShareAudienceContext = {
  /** `window.location.hostname` when running in the browser */
  browserHostname?: string | null;
  /** `users.customer_tier` from auth */
  customerTier?: string | null;
  /** `users.custom_domain` — reseller vanity domain */
  resellerCustomDomain?: string | null;
  /** `users.business_name` — fallback when branding context is inactive */
  userBusinessName?: string | null;
  /** From ResellerBrandingProvider when host or session branding applies */
  brandingActive?: boolean;
  brandingBusinessName?: string | null;
};

/** Base URL (no trailing slash) used for catalogue / WhatsApp share links */
export function resolveCatalogShareOrigin(ctx: CatalogShareAudienceContext): string {
  const site = getSiteUrl().replace(/\/$/, "");
  const tier = String(ctx.customerTier || "").toUpperCase();

  if (tier === "RESELLER") {
    const cd = normalizeResellerDomain(ctx.resellerCustomDomain ?? undefined);
    if (cd) return `https://${cd}`;
  }

  const host = ctx.browserHostname?.trim().toLowerCase();
  if (host) {
    const defaults = getDefaultStoreHostnameSet();
    if (!defaults.has(host)) return `https://${host}`;
  }

  return site;
}

/** Display name in share copy — aligns with `business_name` / navbar reseller branding */
export function resolveCatalogShareBrand(ctx: CatalogShareAudienceContext): string {
  const active = ctx.brandingActive === true;
  const bn = (ctx.brandingBusinessName || "").trim();
  if (active && bn) return bn;

  const tier = String(ctx.customerTier || "").toUpperCase();
  if (tier === "RESELLER") {
    const u = (ctx.userBusinessName || "").trim();
    if (u) return u;
    if (bn) return bn;
  }

  return "KC Jewellers";
}
