import { buildCatalogBaseDescription } from "@/lib/seo-catalog";

/** WebPage JSON-LD for /catalog index. */
export default function CatalogRootStructuredData({
  siteUrl,
}: {
  siteUrl: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Product Catalogue — KC Jewellers",
    description: buildCatalogBaseDescription(),
    url: `${siteUrl}/catalog`,
    isPartOf: {
      "@type": "WebSite",
      name: "KC Jewellers",
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
