import { headers } from "next/headers";

export type PublicResellerBranding = {
  businessName: string | null;
  logoUrl: string | null;
  /** 10-digit mobile saved on the reseller user — used for storefront order WhatsApp. */
  contactPhoneDigits: string | null;
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
    const data = (await res.json()) as {
      business_name?: string | null;
      logo_url?: string | null;
      contact_phone?: string | null;
    };
    const digits = String(data?.contact_phone || "").replace(/\D/g, "");
    const contactPhoneDigits =
      digits.length >= 10 ? digits.slice(-10) : digits.length > 0 ? digits : null;
    if (!data?.business_name && !data?.logo_url && !contactPhoneDigits) return null;
    return {
      businessName: data.business_name || null,
      logoUrl: data.logo_url || null,
      contactPhoneDigits,
    };
  } catch {
    return null;
  }
}

/** Reads `x-custom-domain` set by middleware for custom-host storefronts. */
export async function getStorefrontTenantFromHeaders(): Promise<{
  branding: PublicResellerBranding | null;
  customDomainHost: boolean;
}> {
  const h = await headers();
  const raw = h.get("x-custom-domain")?.trim().toLowerCase();
  if (!raw) return { branding: null, customDomainHost: false };
  const branding = await fetchPublicResellerBranding(raw);
  return { branding, customDomainHost: true };
}

/** @deprecated Prefer getStorefrontTenantFromHeaders when `customDomainHost` is needed */
export async function getBrandingFromMiddlewareHeader(): Promise<PublicResellerBranding | null> {
  const { branding } = await getStorefrontTenantFromHeaders();
  return branding;
}
