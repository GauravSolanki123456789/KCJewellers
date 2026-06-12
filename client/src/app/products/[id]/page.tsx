import type { Metadata } from "next";
import ProductDetailClient from "./product-detail-client";
import ProductJsonLd from "./product-json-ld";
import { resolveCatalogImageUrlForMeta } from "@/lib/normalize-image-url";
import {
  fetchDisplayRates,
  fetchProductByBarcode,
  type ApiProductRow,
} from "@/lib/server-data";
import {
  buildProductMetaDescription,
  buildProductMetadataKeywords,
  buildProductSeoTitle,
} from "@/lib/seo-product";
import { normalizeStorefrontProductId } from "@/lib/catalog-product-filters";
import type { Item } from "@/lib/pricing";
import { getStorefrontDomainFromHeaders } from "@/lib/storefront-domain-server";
import {
  getStorefrontSeoContext,
  storefrontIconMetadata,
  storefrontOgImages,
} from "@/lib/storefront-seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const safeId = normalizeStorefrontProductId(id);
  const seo = await getStorefrontSeoContext();
  const { origin, brandLabel } = seo;
  const productPath = `/products/${encodeURIComponent(safeId)}`;
  const canonical = `${origin}${productPath}`;
  const storefrontDomain = await getStorefrontDomainFromHeaders();
  const [product, liveRates] = await Promise.all([
    fetchProductByBarcode(safeId),
    fetchDisplayRates(storefrontDomain),
  ]);

  if (!product) {
    return {
      metadataBase: seo.metadataBase,
      title: { absolute: `Product · ${brandLabel}` },
      description: `View this piece on ${brandLabel}.`,
      alternates: { canonical },
      robots: { index: false, follow: true },
      ...storefrontIconMetadata(seo.logoUrl),
    };
  }

  const item = product as Item;
  const absTitle = buildProductSeoTitle(item, brandLabel);
  const description = buildProductMetaDescription(item, liveRates, brandLabel);
  const ogImage = resolveCatalogImageUrlForMeta(product.image_url);
  const name =
    (product.name || "").trim() ||
    item.item_name ||
    item.short_name ||
    "Jewellery";
  const ogImages = storefrontOgImages(
    brandLabel,
    seo.logoUrl,
    ogImage ? { url: ogImage, width: 1200, height: 1200, alt: name } : null,
  );

  return {
    metadataBase: seo.metadataBase,
    title: { absolute: absTitle },
    description,
    keywords: buildProductMetadataKeywords(item, brandLabel),
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
      title: absTitle,
      description,
      locale: "en_IN",
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: absTitle,
      description,
      images: ogImages.map((i) => i.url),
    },
    ...storefrontIconMetadata(seo.logoUrl),
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ box?: string; with_box?: string }>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const initialIncludeBox = sp?.box === '1' || sp?.with_box === '1';
  const safeId = normalizeStorefrontProductId(id);
  const storefrontDomain = await getStorefrontDomainFromHeaders();
  const [product, liveRates] = await Promise.all([
    fetchProductByBarcode(safeId),
    fetchDisplayRates(storefrontDomain),
  ]);
  const productPath = `/products/${encodeURIComponent(safeId)}`;

  return (
    <>
      {product ? (
        <ProductJsonLd
          product={product as ApiProductRow}
          liveRates={liveRates}
          productPath={productPath}
        />
      ) : null}
      <ProductDetailClient
        id={id}
        initialProduct={product ? (product as Item) : null}
        initialIncludeBox={initialIncludeBox}
      />
    </>
  );
}
