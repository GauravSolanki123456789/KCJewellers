import CatalogRootStructuredData from "./catalog-root-structured-data";
import CatalogStructuredData from "./catalog-structured-data";
import { getSiteUrl } from "@/lib/site";
import { fetchCatalogJson, resolveCatalogView } from "@/lib/server-data";
import { parseCatalogSlugSegments } from "@/lib/catalog-paths";
import {
  buildCatalogItemListElements,
  buildCatalogPillarDescription,
  buildCatalogPillarTitle,
} from "@/lib/seo-catalog";

/** Server-only JSON-LD — streamed inside Suspense so the catalogue shell can render immediately. */
export default async function CatalogJsonLdAsync({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const site = getSiteUrl();
  const segments = parseCatalogSlugSegments(slug);
  const categories = await fetchCatalogJson();

  if (!segments) {
    return <CatalogRootStructuredData siteUrl={site} />;
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
    <CatalogStructuredData
      siteUrl={site}
      pageUrl={canonical}
      pageName={pageName}
      pageDescription={pageDescription}
      listItems={listItems}
      breadcrumbItems={breadcrumbItems}
    />
  );
}
