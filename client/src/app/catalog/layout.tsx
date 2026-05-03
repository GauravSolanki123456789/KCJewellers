import CatalogPageClient from "./catalog-page-client";
import { CatalogDataProvider, type CatalogTreeCategory } from "./catalog-data-context";
import { CatalogBuilderProvider } from "@/context/CatalogBuilderContext";
import { fetchCatalogJson, fetchDisplayRates } from "@/lib/server-data";

/**
 * Prefetches catalogue JSON on the server so the grid SSR includes real products/rates.
 * Matches ERP-backed identifiers (slug paths, barcode/sku product keys) used in URLs + JSON-LD.
 */
export default async function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, ratesPayload] = await Promise.all([
    fetchCatalogJson(),
    fetchDisplayRates(),
  ]);
  const rates = Array.isArray(ratesPayload) ? ratesPayload : [];

  return (
    <CatalogBuilderProvider>
      <CatalogDataProvider
        initialCategories={categories as CatalogTreeCategory[]}
        initialRates={rates}
      >
        {children}
        <CatalogPageClient />
      </CatalogDataProvider>
    </CatalogBuilderProvider>
  );
}
