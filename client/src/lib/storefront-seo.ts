import { headers } from "next/headers";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import { getOgImagePath } from "@/lib/og-image";
import {
  fetchPublicResellerBranding,
  type PublicResellerBranding,
} from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

export type StorefrontSeoContext = {
  origin: string;
  brandLabel: string;
  isResellerHost: boolean;
  logoUrl: string | null;
  metadataBase: URL;
  branding: PublicResellerBranding | null;
};

function canonicalRequestOrigin(h: Headers): string {
  const host = h.get("host")?.trim();
  if (!host) return getSiteUrl().replace(/\/$/, "");
  const name = host.split(":")[0].toLowerCase();
  if (name === "localhost" || name === "127.0.0.1") {
    return getSiteUrl().replace(/\/$/, "");
  }
  const xfProto = h.get("x-forwarded-proto")?.trim().toLowerCase();
  const proto = xfProto === "http" ? "http" : "https";
  return `${proto}://${host.split(":")[0]}`;
}

/** Reseller vanity domain SEO context (Host → middleware `x-custom-domain`). */
export async function getStorefrontSeoContext(): Promise<StorefrontSeoContext> {
  const h = await headers();
  const rawDomain = h.get("x-custom-domain")?.trim().toLowerCase();
  const branding = rawDomain ? await fetchPublicResellerBranding(rawDomain) : null;
  const brandLabel = branding?.businessName?.trim() || "KC Jewellers";
  const isResellerHost = !!(rawDomain && branding?.businessName);
  const origin = canonicalRequestOrigin(h);
  const logoUrl = normalizeResellerLogoUrl(branding?.logoUrl ?? null);
  return {
    origin,
    brandLabel,
    isResellerHost,
    logoUrl,
    metadataBase: new URL(origin),
    branding,
  };
}

export function storefrontDefaultOgImage(brandLabel: string): {
  url: string;
  width: number;
  height: number;
  alt: string;
} {
  const siteFallback = getSiteUrl();
  const defaultOgRel = getOgImagePath();
  const defaultOgAbs = new URL(defaultOgRel, new URL(siteFallback)).toString();
  return { url: defaultOgAbs, width: 2048, height: 2048, alt: brandLabel };
}

export function storefrontOgImages(
  brandLabel: string,
  logoUrl: string | null,
  fallback?: { url: string; width?: number; height?: number; alt?: string } | null,
): { url: string; width: number; height: number; alt: string }[] {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
    return [{ url: logoUrl, width: 1200, height: 1200, alt: brandLabel }];
  }
  if (fallback?.url) {
    return [
      {
        url: fallback.url,
        width: fallback.width ?? 1200,
        height: fallback.height ?? 630,
        alt: fallback.alt ?? brandLabel,
      },
    ];
  }
  const d = storefrontDefaultOgImage(brandLabel);
  return [d];
}

export function storefrontIconMetadata(logoUrl: string | null): Pick<Metadata, "icons"> {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
    return {
      icons: {
        icon: [{ url: logoUrl }],
        apple: [{ url: logoUrl }],
      },
    };
  }
  return {};
}
