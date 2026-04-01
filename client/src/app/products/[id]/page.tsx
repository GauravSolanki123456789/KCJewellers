import type { Metadata } from "next";
import ProductDetailClient from "./product-detail-client";
import ProductJsonLd from "./product-json-ld";
import { absoluteImageUrl, getSiteUrl } from "@/lib/site";
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
import type { Item } from "@/lib/pricing";

const BRAND = "KC Jewellers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const safeId = String(id || "")
    .trim()
    .slice(0, 64);
  const site = getSiteUrl();
  const productPath = `/products/${encodeURIComponent(safeId)}`;
  const [product, liveRates] = await Promise.all([
    fetchProductByBarcode(safeId),
    fetchDisplayRates(),
  ]);

  if (!product) {
    return {
      title: { absolute: `Product · ${BRAND}` },
      description: `View this piece on ${BRAND}.`,
      alternates: { canonical: `${site}${productPath}` },
      robots: { index: false, follow: true },
    };
  }

  const item = product as Item;
  const absTitle = buildProductSeoTitle(item);
  const description = buildProductMetaDescription(item, liveRates);
  const ogImage = absoluteImageUrl(product.image_url);
  const name =
    (product.name || "").trim() ||
    item.item_name ||
    item.short_name ||
    "Jewellery";

  return {
    title: { absolute: absTitle },
    description,
    keywords: buildProductMetadataKeywords(item),
    alternates: {
      canonical: `${site}${productPath}`,
    },
    openGraph: {
      type: "website",
      url: `${site}${productPath}`,
      siteName: BRAND,
      title: absTitle,
      description,
      locale: "en_IN",
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 1200,
              alt: name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: absTitle,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const safeId = String(id || "")
    .trim()
    .slice(0, 64);
  const [product, liveRates] = await Promise.all([
    fetchProductByBarcode(safeId),
    fetchDisplayRates(),
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
      />
    </>
  );
}
