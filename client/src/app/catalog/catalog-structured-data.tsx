/**
 * JSON-LD for catalogue pillar pages: CollectionPage, ItemList, BreadcrumbList.
 */
export default function CatalogStructuredData({
  siteUrl,
  pageUrl,
  pageName,
  pageDescription,
  listItems,
  breadcrumbItems,
}: {
  siteUrl: string;
  pageUrl: string;
  pageName: string;
  pageDescription: string;
  listItems: { position: number; name: string; url: string }[];
  breadcrumbItems: { position: number; name: string; item: string }[];
}) {
  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: pageName,
    description: pageDescription,
    url: pageUrl,
    isPartOf: {
      "@type": "WebSite",
      name: "KC Jewellers",
      url: siteUrl,
    },
    numberOfItems: listItems.length,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listItems.length,
      itemListElement: listItems.map((el) => ({
        "@type": "ListItem",
        position: el.position,
        name: el.name,
        url: el.url,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbItems.map((b) => ({
      "@type": "ListItem",
      position: b.position,
      name: b.name,
      item: b.item,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(collectionPage),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumb),
        }}
      />
    </>
  );
}
