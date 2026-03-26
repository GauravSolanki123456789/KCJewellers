import type { Metadata } from "next";
import ProductDetailClient from "./product-detail-client";
import { absoluteImageUrl, getSiteUrl } from "@/lib/site";
import { fetchProductByBarcode } from "@/lib/server-data";
import { getItemWeight, type Item } from "@/lib/pricing";

const BRAND = "KC Jewellers";

function titleFromProduct(p: {
  name?: string;
  barcode?: string;
  sku?: string;
}): string {
  const name = (p.name || "").trim();
  const id = (p.barcode || p.sku || "").trim();
  if (name && id) return `${name} · ${id} · ${BRAND}`;
  if (name) return `${name} · ${BRAND}`;
  if (id) return `${id} · ${BRAND}`;
  return BRAND;
}

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
  const product = await fetchProductByBarcode(safeId);
  if (!product) {
    return {
      title: { absolute: `Product · ${BRAND}` },
      description: `View this piece on ${BRAND}.`,
      alternates: { canonical: `${site}/products/${encodeURIComponent(safeId)}` },
    };
  }
  const name = (product.name || "").trim() || "Jewellery";
  const weight = getItemWeight(product as Item);
  const weightStr =
    weight != null ? `${Number(weight).toFixed(2)} gm` : undefined;
  const descParts = [
    `${name} at ${BRAND}.`,
    weightStr ? `Net weight ${weightStr}.` : null,
    "Prices shown incl. GST on the website.",
  ].filter(Boolean);
  const description = descParts.join(" ");
  const ogImage = absoluteImageUrl(product.image_url);

  const absTitle = titleFromProduct(product);

  return {
    title: { absolute: absTitle },
    description,
    alternates: {
      canonical: `${site}/products/${encodeURIComponent(safeId)}`,
    },
    openGraph: {
      type: "website",
      url: `${site}/products/${encodeURIComponent(safeId)}`,
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
  return <ProductDetailClient id={id} />;
}
