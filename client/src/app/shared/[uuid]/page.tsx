import type { Metadata } from "next";
import { headers } from "next/headers";
import SharedCatalogClient from "./shared-catalog-client";
import { getApiUrlForServer, getSiteUrl } from "@/lib/site";
import { getOgImagePath } from "@/lib/og-image";
import {
  fetchPublicResellerBranding,
  type PublicResellerBranding,
} from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

/** Canonical URL for this response — preserves reseller vanity host for OG `url`. */
function canonicalRequestOrigin(headersList: Headers): string {
  const host = headersList.get("host")?.trim();
  if (!host) return getSiteUrl();
  const name = host.split(":")[0].toLowerCase();
  if (name === "localhost" || name === "127.0.0.1") return getSiteUrl();
  const xfProto = headersList.get("x-forwarded-proto")?.trim().toLowerCase();
  const proto = xfProto === "http" ? "http" : "https";
  return `${proto}://${host.split(":")[0]}`;
}

async function fetchBrochureOgHints(uuid: string): Promise<{
  creatorBusinessName: string | null;
  creatorLogoUrl: string | null;
} | null> {
  try {
    const api = getApiUrlForServer();
    const res = await fetch(
      `${api}/api/public/shared-catalog-meta/${encodeURIComponent(uuid)}`,
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      creatorBusinessName?: string | null;
      creatorLogoUrl?: string | null;
    };
    const cn =
      typeof data.creatorBusinessName === "string"
        ? data.creatorBusinessName.trim()
        : "";
    const cl =
      typeof data.creatorLogoUrl === "string" ? data.creatorLogoUrl.trim() : "";
    return {
      creatorBusinessName: cn || null,
      creatorLogoUrl: cl || null,
    };
  } catch {
    return null;
  }
}

function mergeSharedBranding(
  domainBranding: PublicResellerBranding | null,
  hints: { creatorBusinessName: string | null; creatorLogoUrl: string | null } | null,
): PublicResellerBranding | null {
  const domainName = domainBranding?.businessName?.trim() || null;
  const creatorName = hints?.creatorBusinessName?.trim() || null;
  const name = domainName || creatorName || null;

  const domainLogo = domainBranding?.logoUrl ?? null;
  const creatorLogoNorm = normalizeResellerLogoUrl(hints?.creatorLogoUrl ?? null);
  const logo = domainLogo || creatorLogoNorm || null;

  const digits = domainBranding?.contactPhoneDigits ?? null;

  if (!name && !logo && !digits) return null;
  return {
    businessName: name,
    logoUrl: logo,
    contactPhoneDigits: digits,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const h = await headers();
  const rawDomain = h.get("x-custom-domain")?.trim().toLowerCase();
  const domainBranding = rawDomain ? await fetchPublicResellerBranding(rawDomain) : null;
  const hints = await fetchBrochureOgHints(uuid);

  const brandLabel =
    domainBranding?.businessName?.trim() ||
    hints?.creatorBusinessName?.trim() ||
    "KC Jewellers";

  const ogBrandImage =
    normalizeResellerLogoUrl(domainBranding?.logoUrl ?? null) ||
    normalizeResellerLogoUrl(hints?.creatorLogoUrl ?? null);

  const origin = canonicalRequestOrigin(h);
  const siteFallback = getSiteUrl();
  const metadataBase = new URL(origin);
  const pageUrl = `${origin.replace(/\/$/, "")}/shared/${encodeURIComponent(uuid)}`;

  const defaultOgRel = getOgImagePath();
  const defaultOgAbs = new URL(defaultOgRel, new URL(siteFallback)).toString();

  const ogImages =
    ogBrandImage && /^https?:\/\//i.test(ogBrandImage)
      ? [
          {
            url: ogBrandImage,
            width: 1200,
            height: 1200,
            alt: brandLabel,
          },
        ]
      : [
          {
            url: defaultOgAbs,
            width: 2048,
            height: 2048,
            alt: brandLabel,
          },
        ];

  const ogIcon =
    ogBrandImage && /^https?:\/\//i.test(ogBrandImage)
      ? {
          icons: {
            icon: [{ url: ogBrandImage }],
            apple: [{ url: ogBrandImage }],
          },
        }
      : {};

  return {
    metadataBase,
    title: {
      absolute: `Shared catalogue · ${brandLabel}`,
    },
    description: `${brandLabel} — curated jewellery selection with live pricing incl. GST.`,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url: pageUrl,
      siteName: brandLabel,
      title: `${brandLabel} — Shared catalogue`,
      description:
        "Curated jewellery selection — transparent live pricing incl. GST.",
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: `${brandLabel} — Shared catalogue`,
      description: "Curated jewellery selection — live pricing incl. GST.",
      images: ogImages.map((i) => i.url),
    },
    ...ogIcon,
  };
}

export default async function SharedCatalogPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const h = await headers();
  const domain = h.get("x-custom-domain")?.trim().toLowerCase();
  const domainBranding = domain ? await fetchPublicResellerBranding(domain) : null;
  const hints = await fetchBrochureOgHints(uuid);
  const branding = mergeSharedBranding(domainBranding, hints);

  return <SharedCatalogClient initialBranding={branding} />;
}
