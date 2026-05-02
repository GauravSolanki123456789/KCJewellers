import type { Metadata } from "next";
import { headers } from "next/headers";
import SharedCatalogClient from "./shared-catalog-client";
import { getSiteUrl } from "@/lib/site";
import { getOgImagePath } from "@/lib/og-image";
import { fetchPublicResellerBranding } from "@/lib/reseller-branding-server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const h = await headers();
  const rawDomain = h.get("x-custom-domain")?.trim().toLowerCase();
  const branding = rawDomain ? await fetchPublicResellerBranding(rawDomain) : null;
  const brandLabel = branding?.businessName?.trim() || "KC Jewellers";

  const site = getSiteUrl();
  const pageUrl = `${site}/shared/${encodeURIComponent(uuid)}`;
  const ogImage = getOgImagePath();

  const ogImages =
    branding?.logoUrl?.trim().startsWith("http")
      ? [
          {
            url: branding.logoUrl.trim(),
            width: 800,
            height: 800,
            alt: brandLabel,
          },
        ]
      : [
          {
            url: ogImage,
            width: 2048,
            height: 2048,
            alt: brandLabel,
          },
        ];

  return {
    metadataBase: new URL(site),
    title: `Shared catalogue · ${brandLabel}`,
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
  };
}

export default async function SharedCatalogPage() {
  const h = await headers();
  const domain = h.get("x-custom-domain")?.trim().toLowerCase();
  const branding = domain ? await fetchPublicResellerBranding(domain) : null;
  return <SharedCatalogClient initialBranding={branding} />;
}
