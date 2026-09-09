import type { Metadata } from "next";
import { headers } from "next/headers";
import SharedCatalogClient from "./shared-catalog-client";
import { getApiUrlForServer } from "@/lib/site";
import {
  fetchPublicResellerBranding,
  type PublicResellerBranding,
} from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";
import { normalizeKcThemeId } from "@/lib/kc-theme-ids";
import {
  publicRequestOrigin,
  storefrontIconMetadata,
  storefrontSameOriginOgImages,
} from "@/lib/storefront-seo";

async function fetchBrochureOgHints(uuid: string): Promise<{
  creatorBusinessName: string | null;
  creatorLogoUrl: string | null;
  kc_theme_id: string | null;
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
      kc_theme_id?: string | null;
    };
    const cn =
      typeof data.creatorBusinessName === "string"
        ? data.creatorBusinessName.trim()
        : "";
    const cl =
      typeof data.creatorLogoUrl === "string" ? data.creatorLogoUrl.trim() : "";
    const kt =
      typeof data.kc_theme_id === "string" && data.kc_theme_id.trim()
        ? data.kc_theme_id.trim()
        : null;
    return {
      creatorBusinessName: cn || null,
      creatorLogoUrl: cl || null,
      kc_theme_id: kt,
    };
  } catch {
    return null;
  }
}

function mergeSharedBranding(
  domainBranding: PublicResellerBranding | null,
  hints: {
    creatorBusinessName: string | null;
    creatorLogoUrl: string | null;
    kc_theme_id: string | null;
  } | null,
): PublicResellerBranding | null {
  const domainName = domainBranding?.businessName?.trim() || null;
  const creatorName = hints?.creatorBusinessName?.trim() || null;
  const name = domainName || creatorName || null;

  const domainLogo = normalizeResellerLogoUrl(domainBranding?.logoUrl ?? null);
  const creatorLogoNorm = normalizeResellerLogoUrl(hints?.creatorLogoUrl ?? null);
  const logo = domainLogo || creatorLogoNorm || null;

  const digits = domainBranding?.contactPhoneDigits ?? null;

  const kcThemeId = normalizeKcThemeId(
    domainBranding?.kcThemeId ?? hints?.kc_theme_id ?? null,
  );

  if (!name && !logo && !digits) return null;
  return {
    businessName: name,
    logoUrl: logo,
    contactPhoneDigits: digits,
    kcThemeId,
    allowedCategoryIds: domainBranding?.allowedCategoryIds ?? null,
    allowedCategoryMetals: domainBranding?.allowedCategoryMetals ?? null,
    investEnabled: domainBranding?.investEnabled ?? false,
    storefrontMarginPct: domainBranding?.storefrontMarginPct ?? 0,
    showMrpBehindBox: domainBranding?.showMrpBehindBox ?? false,
    hidePrices: domainBranding?.hidePrices ?? false,
    showLiveStock: domainBranding?.showLiveStock ?? false,
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

  const origin = publicRequestOrigin(h);
  const metadataBase = new URL(origin);
  const pageUrl = `${origin.replace(/\/$/, "")}/shared/${encodeURIComponent(uuid)}`;
  const ogImages = storefrontSameOriginOgImages(origin, brandLabel);

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
    ...storefrontIconMetadata(null, true),
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
