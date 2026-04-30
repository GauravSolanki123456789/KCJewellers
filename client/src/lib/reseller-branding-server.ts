import { headers } from "next/headers";

export type PublicResellerBranding = {
  businessName: string | null;
  logoUrl: string | null;
};

function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return "http://localhost:4000";
  return raw.replace(/\/$/, "");
}

/** Server-side fetch — used by RootLayout and shared catalogue pages. */
export async function fetchPublicResellerBranding(
  domain: string,
): Promise<PublicResellerBranding | null> {
  const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (!d) return null;
  const url = `${apiBase()}/api/public/reseller-branding?domain=${encodeURIComponent(d)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { business_name?: string | null; logo_url?: string | null };
    if (!data?.business_name && !data?.logo_url) return null;
    return {
      businessName: data.business_name || null,
      logoUrl: data.logo_url || null,
    };
  } catch {
    return null;
  }
}

/** Reads `x-custom-domain` set by middleware for custom-host storefronts. */
export async function getBrandingFromMiddlewareHeader(): Promise<PublicResellerBranding | null> {
  const h = await headers();
  const raw = h.get("x-custom-domain")?.trim().toLowerCase();
  if (!raw) return null;
  return fetchPublicResellerBranding(raw);
}
