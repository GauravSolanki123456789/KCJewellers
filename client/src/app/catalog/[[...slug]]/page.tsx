import type { Metadata } from "next";
import CatalogStructuredData from "../catalog-structured-data";
import CatalogRootStructuredData from "../catalog-root-structured-data";
import { resolveCatalogImageUrlForMeta } from "@/lib/normalize-image-url";
import {
  fetchCatalogJson,
  resolveCatalogView,
} from "@/lib/server-data";
import { getStorefrontDomainFromHeaders } from "@/lib/storefront-domain-server";
import { parseCatalogSlugSegments } from "@/lib/catalog-paths";
import {
  buildCatalogBaseDescription,
  buildCatalogItemListElements,
  buildCatalogPillarDescription,
  buildCatalogPillarTitle,
  metadataKeywordsForPillar,
} from "@/lib/seo-catalog";
import {
  getStorefrontSeoContext,
  storefrontIconMetadata,
  storefrontOgImages,
} from "@/lib/storefront-seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const seo = await getStorefrontSeoContext();
  const { origin, brandLabel, isResellerHost } = seo;
  const segments = parseCatalogSlugSegments(slug);
  const storefrontDomain = await getStorefrontDomainFromHeaders();
  const categories = await fetchCatalogJson(storefrontDomain);

  if (!segments) {
    const titleBase = isResellerHost
      ? `Product Catalogue · ${brandLabel}`
      : `Product Catalogue · KC Jewellers`;
    const description = buildCatalogBaseDescription(brandLabel);
    const pageUrl = `${origin}/catalog`;
    const ogImages = storefrontOgImages(brandLabel, seo.logoUrl);
    return {
      metadataBase: seo.metadataBase,
      title: { absolute: titleBase },
      description,
      keywords: [
        "gold jewellery",
        "silver jewellery",
        "diamond jewellery",
        "gifting",
        brandLabel,
        "India",
        "GST",
        "live rates",
      ],
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },
      alternates: { canonical: pageUrl },
      openGraph: {
        type: "website",
        url: pageUrl,
        siteName: brandLabel,
        title: titleBase,
        description,
        locale: "en_IN",
        images: ogImages,
      },
      twitter: {
        card: "summary_large_image",
        title: titleBase,
        description,
        images: ogImages.map((i) => i.url),
      },
      ...storefrontIconMetadata(seo.logoUrl),
    };
  }

  const { metal, styleSlug, skuSlug } = segments;
  const { style: cat, sub, itemCount, metalLabel } = resolveCatalogView(
    categories,
    { style: styleSlug, sku: skuSlug, metal },
  );

  const titleBase = buildCatalogPillarTitle(
    cat?.name,
    sub?.name,
    metalLabel,
    brandLabel,
  );
  const description = buildCatalogPillarDescription(
    itemCount,
    cat?.name,
    sub?.name,
    metalLabel,
    brandLabel,
  );
  const titleParts = [cat?.name, sub?.name].filter(Boolean);

  const productOgImage =
    resolveCatalogImageUrlForMeta(cat?.image_url) ||
    resolveCatalogImageUrlForMeta(
      (sub?.products?.[0] as { image_url?: string } | undefined)?.image_url,
    );

  const pathSeg = `${metal}/${encodeURIComponent(styleSlug)}/${encodeURIComponent(skuSlug)}`;
  const canonical = `${origin}/catalog/${pathSeg}`;

  const ogImages = isResellerHost
    ? storefrontOgImages(brandLabel, seo.logoUrl)
    : storefrontOgImages(
        brandLabel,
        seo.logoUrl,
        productOgImage
          ? { url: productOgImage, alt: titleParts.join(" › ") || brandLabel }
          : null,
      );

  return {
    metadataBase: seo.metadataBase,
    title: { absolute: titleBase },
    description,
    keywords: metadataKeywordsForPillar(cat?.name, sub?.name, metalLabel, brandLabel),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: brandLabel,
      title: titleBase,
      description,
      locale: "en_IN",
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: titleBase,
      description,
      images: ogImages.map((i) => i.url),
    },
    ...storefrontIconMetadata(seo.logoUrl),
  };
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const seo = await getStorefrontSeoContext();
  const { origin, brandLabel } = seo;
  const segments = parseCatalogSlugSegments(slug);
  const storefrontDomain = await getStorefrontDomainFromHeaders();
  const categories = await fetchCatalogJson(storefrontDomain);

  if (!segments) {
    return (
      <>
        <CatalogRootStructuredData siteUrl={origin} brandLabel={brandLabel} />
      </>
    );
  }

  const { metal, styleSlug, skuSlug } = segments;
  const { style: cat, sub, itemCount, metalLabel, products } = resolveCatalogView(
    categories,
    { style: styleSlug, sku: skuSlug, metal },
  );

  const pageName = buildCatalogPillarTitle(
    cat?.name,
    sub?.name,
    metalLabel,
    brandLabel,
  );
  const pageDescription = buildCatalogPillarDescription(
    itemCount,
    cat?.name,
    sub?.name,
    metalLabel,
    brandLabel,
  );
  const pathSeg = `${metal}/${encodeURIComponent(styleSlug)}/${encodeURIComponent(skuSlug)}`;
  const canonical = `${origin}/catalog/${pathSeg}`;
  const listItems = buildCatalogItemListElements(products, origin);
  const breadcrumbItems = [
    { position: 1, name: "Home", item: `${origin}/` },
    { position: 2, name: "Catalogue", item: `${origin}/catalog` },
    {
      position: 3,
      name: [metalLabel, sub?.name || cat?.name].filter(Boolean).join(" — ") || "Collection",
      item: canonical,
    },
  ];

  return (
    <>
      <CatalogStructuredData
        siteUrl={origin}
        brandLabel={brandLabel}
        pageUrl={canonical}
        pageName={pageName}
        pageDescription={pageDescription}
        listItems={listItems}
        breadcrumbItems={breadcrumbItems}
      />
    </>
  );
}
