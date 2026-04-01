import CatalogDataProvider from "./catalog-data-context";
import CatalogPageClient from "./catalog-page-client";

/**
 * Keeps catalogue UI + data provider mounted across /catalog and /catalog/... slug changes
 * so navigation does not blank the screen or refetch from scratch on every segment change.
 */
export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CatalogDataProvider>
      <CatalogPageClient />
      {children}
    </CatalogDataProvider>
  );
}
