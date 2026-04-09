import CatalogPageClient from "./catalog-page-client";
import { CatalogDataProvider } from "./catalog-data-context";
import { CatalogBuilderProvider } from "@/context/CatalogBuilderContext";

/**
 * Single client shell + shared catalogue/rates cache across /catalog and /catalog/.../.../...
 * so client-side navigation does not refetch or remount the grid (no blank flash).
 */
export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CatalogBuilderProvider>
      <CatalogDataProvider>
        {children}
        <CatalogPageClient />
      </CatalogDataProvider>
    </CatalogBuilderProvider>
  );
}
