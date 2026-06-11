import { buildCatalogBaseDescription } from "@/lib/seo-catalog";

/** WebPage JSON-LD for /catalog index. */
export default function CatalogRootStructuredData({
  siteUrl,
  brandLabel = "KC Jewellers",
}: {
  siteUrl: string;
  brandLabel?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Product Catalogue — ${brandLabel}`,
    description: buildCatalogBaseDescription(brandLabel),
    url: `${siteUrl}/catalog`,
    isPartOf: {
      "@type": "WebSite",
      name: brandLabel,
      url: siteUrl,
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
