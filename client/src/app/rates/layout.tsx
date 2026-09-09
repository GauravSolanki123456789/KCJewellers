import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  fetchPublicResellerBranding,
} from "@/lib/reseller-branding-server";
import {
  publicRequestOrigin,
  storefrontIconMetadata,
  storefrontSameOriginOgImages,
  storefrontOgImages,
} from "@/lib/storefront-seo";
import { getOgImagePath } from "@/lib/og-image";
import { getSiteUrl } from "@/lib/site";

const PAGE_TITLE = "Today Rates";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const rawDomain = h.get("x-custom-domain")?.trim().toLowerCase();
  const branding = rawDomain ? await fetchPublicResellerBranding(rawDomain) : null;
  const brandLabel = branding?.businessName?.trim() || "KC Jewellers";
  const isResellerHost = !!(rawDomain && branding?.businessName);

  const origin = publicRequestOrigin(h);
  const metadataBase = new URL(origin);
  const pageUrl = `${origin.replace(/\/$/, "")}/rates`;

  const ogImages = isResellerHost
    ? storefrontSameOriginOgImages(origin, brandLabel)
    : storefrontOgImages(brandLabel, null, {
        url: new URL(getOgImagePath(), new URL(getSiteUrl())).toString(),
        width: 2048,
        height: 2048,
        alt: brandLabel,
      });

  const description = isResellerHost
    ? `${brandLabel} — today's gold (24K, 22K, 18K) and silver rates. Browse our jewellery catalogue.`
    : "Today's gold (24K, 22K, 18K) and silver rates at KC Jewellers — view prices and book your rate in one place.";

  return {
    metadataBase,
    title: {
      absolute: isResellerHost ? `${PAGE_TITLE} · ${brandLabel}` : PAGE_TITLE,
    },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url: pageUrl,
      siteName: brandLabel,
      title: isResellerHost ? `${brandLabel} — ${PAGE_TITLE}` : PAGE_TITLE,
      description,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: isResellerHost ? `${brandLabel} — ${PAGE_TITLE}` : PAGE_TITLE,
      description,
      images: ogImages.map((i) => i.url),
    },
    ...storefrontIconMetadata(null, isResellerHost),
  };
}

export default function RatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
