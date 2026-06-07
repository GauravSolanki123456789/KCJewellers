import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSiteUrl } from "@/lib/site";
import { getOgImagePath } from "@/lib/og-image";
import {
  fetchPublicResellerBranding,
} from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

const PAGE_TITLE = "Today Rates";

function canonicalRequestOrigin(headersList: Headers): string {
  const host = headersList.get("host")?.trim();
  if (!host) return getSiteUrl();
  const name = host.split(":")[0].toLowerCase();
  if (name === "localhost" || name === "127.0.0.1") return getSiteUrl();
  const xfProto = headersList.get("x-forwarded-proto")?.trim().toLowerCase();
  const proto = xfProto === "http" ? "http" : "https";
  return `${proto}://${host.split(":")[0]}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const rawDomain = h.get("x-custom-domain")?.trim().toLowerCase();
  const branding = rawDomain ? await fetchPublicResellerBranding(rawDomain) : null;
  const brandLabel = branding?.businessName?.trim() || "KC Jewellers";
  const isResellerHost = !!(rawDomain && branding?.businessName);

  const origin = canonicalRequestOrigin(h);
  const siteFallback = getSiteUrl();
  const metadataBase = new URL(origin);
  const pageUrl = `${origin.replace(/\/$/, "")}/rates`;

  const ogBrandImage = normalizeResellerLogoUrl(branding?.logoUrl ?? null);
  const defaultOgRel = getOgImagePath();
  const defaultOgAbs = new URL(defaultOgRel, new URL(siteFallback)).toString();

  const ogImages =
    ogBrandImage && /^https?:\/\//i.test(ogBrandImage)
      ? [{ url: ogBrandImage, width: 1200, height: 1200, alt: brandLabel }]
      : [{ url: defaultOgAbs, width: 2048, height: 2048, alt: brandLabel }];

  const description = isResellerHost
    ? `${brandLabel} — today's gold (24K, 22K, 18K) and silver rates. Browse our jewellery catalogue.`
    : "Today's gold (24K, 22K, 18K) and silver rates at KC Jewellers — view prices and book your rate in one place.";

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
    ...ogIcon,
  };
}

export default function RatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
