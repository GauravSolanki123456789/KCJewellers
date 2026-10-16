import { CATALOG_PATH } from "@/lib/routes";

const METALS = new Set(["gold", "silver", "diamond", "gifting"]);

/** Map common menu aliases to canonical catalogue metal segment. */
export function normalizeCatalogMetalSegment(seg: string): string | null {
  const m = String(seg || "").trim().toLowerCase();
  if (!m) return null;
  if (METALS.has(m)) return m;
  if (m === "gift" || m === "gifts" || m === "gift-items" || m === "giftitems") {
    return "gifting";
  }
  return null;
}

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

/** Metal tab only — e.g. /catalog/silver */
export function buildCatalogMetalPath(metal: string): string {
  const m = normalizeCatalogMetalSegment(metal) || metal.toLowerCase().trim();
  return `${CATALOG_PATH}/${encodeURIComponent(m)}`;
}

/** Category under a metal — opens first matching style (catalog client resolves sub). */
export function buildCatalogCategoryPath(metal: string, categorySlug: string): string {
  const m = normalizeCatalogMetalSegment(metal) || metal.toLowerCase().trim();
  const c = categorySlug.trim();
  return `${CATALOG_PATH}/${encodeURIComponent(m)}/${encodeURIComponent(c)}`;
}

export type ParsedCatalogPath = {
  metal: string;
  styleSlug?: string;
  skuSlug?: string;
};

/** Parse 1–3 segments after /catalog (metal, optional style, optional subcategory). */
export function parseCatalogSlugSegments(
  slug: string[] | undefined
): ParsedCatalogPath | null {
  if (!slug || slug.length < 1 || slug.length > 3) return null;
  const metal = normalizeCatalogMetalSegment(slug[0]);
  if (!metal) return null;
  if (slug.length === 1) return { metal };
  const styleSlug = String(slug[1] || "").trim();
  if (!styleSlug) return null;
  if (slug.length === 2) return { metal, styleSlug };
  const skuSlug = String(slug[2] || "").trim();
  if (!skuSlug) return null;
  return { metal, styleSlug, skuSlug };
}
