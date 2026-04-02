import type { Metadata } from "next";
import CatalogStructuredData from "../catalog-structured-data";
import CatalogRootStructuredData from "../catalog-root-structured-data";
import { getSiteUrl } from "@/lib/site";
import { resolveCatalogImageUrlForMeta } from "@/lib/normalize-image-url";
import { fetchCatalogJson, resolveCatalogView } from "@/lib/server-data";
import { parseCatalogSlugSegments } from "@/lib/catalog-paths";
import {
  buildCatalogBaseDescription,
  buildCatalogItemListElements,
  buildCatalogPillarDescription,
  buildCatalogPillarTitle,
  metadataKeywordsForPillar,
} from "@/lib/seo-catalog";

const BRAND = "KC Jewellers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = getSiteUrl();
  const segments = parseCatalogSlugSegments(slug);
  const categories = await fetchCatalogJson();

  if (!segments) {
    const titleBase = `Product Catalogue · ${BRAND}`;
    const description = buildCatalogBaseDescription();
    return {
      title: { absolute: titleBase },
      description,
      keywords: [
        "gold jewellery",
        "silver jewellery",
        "diamond jewellery",
        BRAND,
        "India",
        "GST",
        "live rates",
      ],
      alternates: { canonical: `${site}/catalog` },
      openGraph: {
        type: "website",
        url: `${site}/catalog`,
        siteName: BRAND,
        title: titleBase,
        description,
        locale: "en_IN",
      },
      twitter: {
        card: "summary_large_image",
        title: titleBase,
        description,
      },
    };
  }

  const { metal, styleSlug, skuSlug } = segments;
  const { style: cat, sub, itemCount, metalLabel } = resolveCatalogView(
    categories,
    { style: styleSlug, sku: skuSlug, metal },
  );

  const titleBase = buildCatalogPillarTitle(cat?.name, sub?.name, metalLabel);
  const description = buildCatalogPillarDescription(
    itemCount,
    cat?.name,
    sub?.name,
    metalLabel,
  );
  const titleParts = [cat?.name, sub?.name].filter(Boolean);

  const ogImage =
    resolveCatalogImageUrlForMeta(cat?.image_url) ||
    resolveCatalogImageUrlForMeta(
      (sub?.products?.[0] as { image_url?: string } | undefined)?.image_url,
    );

  const pathSeg = `${metal}/${encodeURIComponent(styleSlug)}/${encodeURIComponent(skuSlug)}`;
  const canonical = `${site}/catalog/${pathSeg}`;

  return {
    title: { absolute: titleBase },
    description,
    keywords: metadataKeywordsForPillar(cat?.name, sub?.name, metalLabel),
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
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

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const site = getSiteUrl();
  const segments = parseCatalogSlugSegments(slug);
  const categories = await fetchCatalogJson();

  if (!segments) {
    return (
      <>
        <CatalogRootStructuredData siteUrl={site} />
      </>
    );
  }

  const { metal, styleSlug, skuSlug } = segments;
  const { style: cat, sub, itemCount, metalLabel, products } = resolveCatalogView(
    categories,
    { style: styleSlug, sku: skuSlug, metal },
  );

  const pageName = buildCatalogPillarTitle(cat?.name, sub?.name, metalLabel);
  const pageDescription = buildCatalogPillarDescription(
    itemCount,
    cat?.name,
    sub?.name,
    metalLabel,
  );
  const pathSeg = `${metal}/${encodeURIComponent(styleSlug)}/${encodeURIComponent(skuSlug)}`;
  const canonical = `${site}/catalog/${pathSeg}`;
  const listItems = buildCatalogItemListElements(products, site);
  const breadcrumbItems = [
    { position: 1, name: "Home", item: `${site}/` },
    { position: 2, name: "Catalogue", item: `${site}/catalog` },
    {
      position: 3,
      name: [metalLabel, sub?.name || cat?.name].filter(Boolean).join(" — ") || "Collection",
      item: canonical,
    },
  ];

  return (
    <>
      <CatalogStructuredData
        siteUrl={site}
        pageUrl={canonical}
        pageName={pageName}
        pageDescription={pageDescription}
        listItems={listItems}
        breadcrumbItems={breadcrumbItems}
      />
    </>
  );
}
