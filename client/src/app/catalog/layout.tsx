import CatalogPageClient from "./catalog-page-client";

/**
 * Keeps the catalogue shell mounted across /catalog and /catalog/... slug changes
 * so navigation does not remount the client (no full-screen blank flash).
 */
export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <CatalogPageClient />
    </>
  );
}
