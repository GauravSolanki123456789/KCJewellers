import { absoluteImageUrl, getSiteUrl } from "@/lib/site";
import { calculateBreakdown, getItemWeight, type Item } from "@/lib/pricing";
import type { ApiProductRow } from "@/lib/server-data";

function displayName(p: Item | ApiProductRow): string {
  const row = p as ApiProductRow;
  return (
    (row.name || "").trim() ||
    (p as Item).item_name ||
    (p as Item).short_name ||
    "Jewellery"
  );
}

export default function ProductJsonLd({
  product,
  liveRates,
  productPath,
}: {
  product: Item | ApiProductRow;
  liveRates: unknown;
  productPath: string;
}) {
  const site = getSiteUrl();
  const url = `${site}${productPath}`;
  const name = displayName(product);
  const img = absoluteImageUrl(
    (product as { image_url?: string }).image_url
  );
  const gst = Number((product as { gst_rate?: number }).gst_rate ?? 3) || 3;
  const b = calculateBreakdown(product as Item, liveRates, gst);
  const weight = getItemWeight(product as Item);
  const sku =
    (product as ApiProductRow).barcode ||
    (product as ApiProductRow).sku ||
    String((product as ApiProductRow).id ?? "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    sku: sku || undefined,
    image: img ? [img] : undefined,
    ...(weight != null
      ? {
          additionalProperty: [
            {
              "@type": "PropertyValue",
              name: "net_weight",
              value: `${Number(weight).toFixed(2)} gm`,
            },
          ],
        }
      : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: Math.round(b.total),
      availability: "https://schema.org/InStock",
      priceValidUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
