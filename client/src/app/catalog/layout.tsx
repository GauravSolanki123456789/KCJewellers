import CatalogPageClient from "./catalog-page-client";

/**
 * Keeps catalogue UI mounted across /catalog and /catalog/... slug changes so
 * client navigation does not blank the screen or remount the whole grid.
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
