import { CATALOG_PATH } from "@/lib/routes";

const METALS = new Set(["gold", "silver", "diamond"]);

/** Canonical catalogue path: /catalog/{metal}/{category_slug}/{subcategory_slug} */
export function buildCatalogSegmentPath(
  metal: string,
  categorySlug: string,
  subcategorySlug: string
): string {
  const m = metal.toLowerCase().trim();
  const c = categorySlug.trim();
  const s = subcategorySlug.trim();
  return `${CATALOG_PATH}/${encodeURIComponent(m)}/${encodeURIComponent(c)}/${encodeURIComponent(s)}`;
}

export type ParsedCatalogPath = {
  metal: string;
  styleSlug: string;
  skuSlug: string;
};

/** Parse optional catch-all segments after /catalog. */
export function parseCatalogSlugSegments(
  slug: string[] | undefined
): ParsedCatalogPath | null {
  if (!slug || slug.length !== 3) return null;
  const [metal, styleSlug, skuSlug] = slug.map((s) => String(s || "").trim());
  if (!metal || !styleSlug || !skuSlug) return null;
  if (!METALS.has(metal.toLowerCase())) return null;
  return { metal: metal.toLowerCase(), styleSlug, skuSlug };
}

/** Parse /catalog/{metal}/{style}/{sku} from the current pathname (client navigation). */
export function pathSegmentsFromPathname(
  pathname: string
): ParsedCatalogPath | null {
  if (!pathname.startsWith(CATALOG_PATH + "/") && pathname !== CATALOG_PATH) {
    return null;
  }
  const rest =
    pathname === CATALOG_PATH
      ? ""
      : pathname.slice(CATALOG_PATH.length).replace(/^\//, "").replace(/\/$/, "");
  if (!rest) return null;
  const parts = rest.split("/").filter(Boolean);
  return parseCatalogSlugSegments(parts);
}
