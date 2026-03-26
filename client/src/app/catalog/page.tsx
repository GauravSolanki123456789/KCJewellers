import type { Metadata } from "next";
import { Suspense } from "react";
import CatalogPageClient from "./catalog-page-client";
import { absoluteImageUrl, getSiteUrl } from "@/lib/site";
import {
  fetchCatalogJson,
  resolveCatalogView,
} from "@/lib/server-data";

const BRAND = "KC Jewellers";

type Search = { [key: string]: string | string[] | undefined };

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Search>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const site = getSiteUrl();
  const style = firstString(sp.style)?.trim();
  const sku = firstString(sp.sku)?.trim();
  const metal = firstString(sp.metal)?.trim();

  const categories = await fetchCatalogJson();
  const { style: cat, sub, itemCount, metalLabel } = resolveCatalogView(
    categories,
    { style, sku, metal },
  );

  const titleParts = [cat?.name, sub?.name].filter(Boolean);
  const titleBase =
    titleParts.length > 0
      ? `${titleParts.join(" › ")} · ${BRAND}`
      : `Product Catalogue · ${BRAND}`;

  const descParts = [
    titleParts.length > 0
      ? `Browse ${itemCount} piece${itemCount !== 1 ? "s" : ""} in ${[cat?.name, sub?.name].filter(Boolean).join(" › ")}${metalLabel ? ` (${metalLabel})` : ""} at ${BRAND}.`
      : `Browse gold, silver, and diamond jewellery at ${BRAND}. Live pricing incl. GST.`,
  ];

  const description = descParts.join(" ");

  const ogImage =
    absoluteImageUrl(cat?.image_url) ||
    (() => {
      const first = sub?.products?.[0] as { image_url?: string } | undefined;
      return absoluteImageUrl(first?.image_url);
    })();

  const canonical = new URL("/catalog", site);
  if (style) canonical.searchParams.set("style", style);
  if (sku) canonical.searchParams.set("sku", sku);
  if (metal) canonical.searchParams.set("metal", metal);

  return {
    title: { absolute: titleBase },
    description,
    alternates: { canonical: canonical.toString() },
    openGraph: {
      type: "website",
      url: canonical.toString(),
      siteName: BRAND,
      title: titleBase,
      description,
      locale: "en_IN",
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: titleParts.join(" › ") || BRAND,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: titleBase,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function CatalogFallback() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse">Loading catalogue…</div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<CatalogFallback />}>
      <CatalogPageClient />
    </Suspense>
  );
}
