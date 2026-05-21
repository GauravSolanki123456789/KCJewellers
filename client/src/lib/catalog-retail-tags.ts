import { CATALOG_PATH } from "@/lib/routes";

/**
 * Retail presentation tags on `web_subcategories` — must match server.js
 * (`CATALOG_AUDIENCE_VALUES`, `CATALOG_PRODUCT_TYPE_VALUES`).
 *
 * ERP sync (style code → web_categories, SKU → web_subcategories) is unchanged.
 * Metals (gold / silver / diamond / future gift) are a separate axis from audience.
 */

/** Catalogue metal tab keys — extend here when adding e.g. gift items. */
export const CATALOG_METAL_KEYS = ["gold", "silver", "diamond"] as const;
export type CatalogMetalKey = (typeof CATALOG_METAL_KEYS)[number];

export const CATALOG_AUDIENCE_VALUES = [
  "women",
  "men",
  "kids",
  "unisex",
] as const;
export type CatalogAudience = (typeof CATALOG_AUDIENCE_VALUES)[number];

export const CATALOG_PRODUCT_TYPE_VALUES = [
  "necklace",
  "bangle",
  "bracelet",
  "ring",
  "pendant",
  "pendant_set",
  "earring",
  "chain",
  "set",
  "kada",
  "other",
] as const;
export type CatalogProductType = (typeof CATALOG_PRODUCT_TYPE_VALUES)[number];

/** Shop-for filter including “show everything” (regular catalogue). */
export type CatalogShopFor = "all" | CatalogAudience;

export type CatalogRetailSubcategory = {
  audience?: string | null;
  product_type?: string | null;
  name?: string;
  slug?: string;
};

export const CATALOG_AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "unisex", label: "Unisex" },
];

export const CATALOG_PRODUCT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "necklace", label: "Necklace" },
  { value: "bangle", label: "Bangle" },
  { value: "bracelet", label: "Bracelet" },
  { value: "ring", label: "Ring" },
  { value: "pendant", label: "Pendant" },
  { value: "pendant_set", label: "Pendant set" },
  { value: "earring", label: "Earring" },
  { value: "chain", label: "Chain" },
  { value: "set", label: "Set" },
  { value: "kada", label: "Kada" },
  { value: "other", label: "Other" },
];

export const CATALOG_SHOP_FOR_TABS: { key: CatalogShopFor; label: string }[] = [
  { key: "all", label: "All" },
  { key: "women", label: "Women" },
  { key: "men", label: "Men" },
  { key: "kids", label: "Kids" },
];

const AUDIENCE_LABELS: Record<CatalogAudience, string> = {
  women: "Women",
  men: "Men",
  kids: "Kids",
  unisex: "Unisex",
};

const PRODUCT_TYPE_LABELS: Record<CatalogProductType, string> = {
  necklace: "Necklace",
  bangle: "Bangle",
  bracelet: "Bracelet",
  ring: "Ring",
  pendant: "Pendant",
  pendant_set: "Pendant set",
  earring: "Earring",
  chain: "Chain",
  set: "Set",
  kada: "Kada",
  other: "Other",
};

/** Quick links in SmartSearch when the field is focused (before typing). */
export const CATALOG_DISCOVERY_CHIPS: {
  shopFor: CatalogAudience;
  productType: CatalogProductType;
  label: string;
}[] = [
  { shopFor: "women", productType: "necklace", label: "Women · Necklaces" },
  { shopFor: "women", productType: "bangle", label: "Women · Bangles" },
  { shopFor: "women", productType: "earring", label: "Women · Earrings" },
  { shopFor: "women", productType: "pendant", label: "Women · Pendants" },
  { shopFor: "men", productType: "chain", label: "Men · Chains" },
  { shopFor: "men", productType: "bracelet", label: "Men · Bracelets" },
  { shopFor: "kids", productType: "pendant", label: "Kids · Pendants" },
  { shopFor: "kids", productType: "earring", label: "Kids · Earrings" },
];

export function normalizeCatalogAudience(raw: unknown): CatalogAudience | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  return (CATALOG_AUDIENCE_VALUES as readonly string[]).includes(v)
    ? (v as CatalogAudience)
    : null;
}

export function normalizeCatalogProductType(raw: unknown): CatalogProductType | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!v) return null;
  return (CATALOG_PRODUCT_TYPE_VALUES as readonly string[]).includes(v)
    ? (v as CatalogProductType)
    : null;
}

export function normalizeCatalogShopFor(raw: unknown): CatalogShopFor {
  if (raw === "all" || raw === null || raw === undefined || raw === "") return "all";
  const aud = normalizeCatalogAudience(raw);
  return aud ?? "all";
}

export function normalizeCatalogMetalKey(raw: unknown): CatalogMetalKey {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (CATALOG_METAL_KEYS as readonly string[]).includes(v)
    ? (v as CatalogMetalKey)
    : "silver";
}

export function catalogAudienceLabel(audience: CatalogAudience): string {
  return AUDIENCE_LABELS[audience];
}

export function catalogProductTypeLabel(productType: CatalogProductType): string {
  return PRODUCT_TYPE_LABELS[productType];
}

/** Infer product type from SKU name/slug when admin tag is not set yet (e.g. PITARA / BANGLE). */
export function inferCatalogProductTypeFromSubcategory(sub: {
  name?: string;
  slug?: string | null;
}): CatalogProductType | null {
  const blob = `${sub.name ?? ""} ${sub.slug ?? ""}`
    .toLowerCase()
    .replace(/[-_]/g, " ");
  if (/\bpendant\s*set\b/.test(blob)) return "pendant_set";
  if (/\bbangle\b|\bchuri\b|\bchooda\b/.test(blob)) return "bangle";
  if (/\bbracelet\b/.test(blob)) return "bracelet";
  if (/\bkada\b|\bflexi\b/.test(blob)) return "kada";
  if (/\bnecklace\b|\bhaar\b|\bmala\b/.test(blob)) return "necklace";
  if (/\bearring\b|\btops\b|\bjhumka\b|\bbali\b/.test(blob)) return "earring";
  if (/\bring\b/.test(blob)) return "ring";
  if (/\bpendant\b|\blocket\b|\bkanti\b/.test(blob)) return "pendant";
  if (/\bchain\b/.test(blob)) return "chain";
  if (/\ber set\b|\bset\b/.test(blob)) return "set";
  return null;
}

export function resolveCatalogProductType(
  sub: CatalogRetailSubcategory,
): CatalogProductType | null {
  return (
    normalizeCatalogProductType(sub.product_type) ??
    inferCatalogProductTypeFromSubcategory(sub)
  );
}

/** Whether a subcategory matches the active shop-for + optional product-type filter. */
export function subcategoryMatchesRetailFilter(
  sub: CatalogRetailSubcategory,
  shopFor: CatalogShopFor,
  productType: CatalogProductType | "all",
): boolean {
  const aud = normalizeCatalogAudience(sub.audience);
  const pt = resolveCatalogProductType(sub);

  if (shopFor !== "all") {
    if (!aud) return false;
    if (shopFor === "kids") {
      if (aud !== "kids") return false;
    } else if (shopFor === "women") {
      if (aud !== "women" && aud !== "unisex") return false;
    } else if (shopFor === "men") {
      if (aud !== "men" && aud !== "unisex") return false;
    } else if (aud !== shopFor) {
      return false;
    }
  }

  if (productType !== "all") {
    if (!pt || pt !== productType) return false;
  }

  return true;
}

export type CatalogTreeWithRetail<T extends CatalogRetailSubcategory> = {
  subcategories: (T & { products?: unknown[] })[];
};

/** Filter category tree by retail tags (metal filtering applied separately). Preserves category fields. */
export function filterCatalogTreeByRetail<
  T extends CatalogTreeWithRetail<CatalogRetailSubcategory>,
>(categories: T[], shopFor: CatalogShopFor, productType: CatalogProductType | "all"): T[] {
  if (shopFor === "all" && productType === "all") return categories;
  return categories
    .map((cat) => ({
      ...cat,
      subcategories: cat.subcategories.filter((sub) =>
        subcategoryMatchesRetailFilter(sub, shopFor, productType),
      ),
    }))
    .filter((cat) => cat.subcategories.length > 0) as T[];
}

export function parseCatalogRetailSearchParams(
  search: string | URLSearchParams,
): {
  shopFor: CatalogShopFor;
  productType: CatalogProductType | "all";
} {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const shopFor = normalizeCatalogShopFor(params.get("shop_for"));
  const ptRaw = params.get("product_type");
  const pt = ptRaw ? normalizeCatalogProductType(ptRaw) : null;
  return {
    shopFor,
    productType: pt ?? "all",
  };
}

export function buildCatalogRetailQueryString(
  shopFor: CatalogShopFor,
  productType: CatalogProductType | "all",
): string {
  if (shopFor === "all" && productType === "all") return "";
  const params = new URLSearchParams();
  if (shopFor !== "all") params.set("shop_for", shopFor);
  if (productType !== "all") params.set("product_type", productType);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Deep link from search discovery chips — metal + retail filters, no style path yet. */
export function buildCatalogShopHref(
  shopFor: CatalogAudience,
  productType: CatalogProductType,
  metal: string = "silver",
): string {
  const m = normalizeCatalogMetalKey(metal);
  const q = buildCatalogRetailQueryString(shopFor, productType);
  return `${CATALOG_PATH}/${m}${q}`;
}

/** Preserve retail query string when updating catalogue pathname. */
export function catalogPathWithRetailQuery(
  pathname: string,
  shopFor: CatalogShopFor,
  productType: CatalogProductType | "all",
): string {
  const q = buildCatalogRetailQueryString(shopFor, productType);
  return `${pathname.replace(/\/$/, "")}${q}`;
}

/** Product types available for the current metal + shop-for (for type chip row). */
export function collectAvailableProductTypes(
  categories: CatalogTreeWithRetail<CatalogRetailSubcategory>[],
  shopFor: CatalogShopFor,
): CatalogProductType[] {
  if (shopFor === "all") return [];
  const seen = new Set<CatalogProductType>();
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      if (!subcategoryMatchesRetailFilter(sub, shopFor, "all")) continue;
      const pt = resolveCatalogProductType(sub);
      if (pt) seen.add(pt);
    }
  }
  return CATALOG_PRODUCT_TYPE_VALUES.filter((k) => seen.has(k));
}

export function subSlugMatchesRetailPath(
  subSlug: string,
  pathSkuSegment: string,
): boolean {
  const s = (subSlug || "").toLowerCase();
  const w = (pathSkuSegment || "").toLowerCase().trim();
  if (!w) return false;
  if (s === w) return true;
  if (w.includes("-") && s.startsWith(`${w}-`)) return true;
  return false;
}

export function isSelectionValidInRetailTree<
  T extends CatalogRetailSubcategory & { id: number },
  C extends { id: number; subcategories: T[] },
>(tree: C[], styleId: number | null, skuId: number | null): boolean {
  if (styleId == null) return false;
  const cat = tree.find((c) => c.id === styleId);
  if (!cat) return false;
  if (skuId == null) return cat.subcategories.length > 0;
  return cat.subcategories.some((s) => s.id === skuId);
}

/**
 * Pick style + SKU that match retail filters. Prefers current selection (sidebar clicks)
 * when valid, then URL path, then first row matching product_type, then first row in tree.
 */
export function resolveRetailCatalogSelection<
  T extends CatalogRetailSubcategory & { id: number; slug?: string; name?: string },
  C extends { id: number; slug?: string; subcategories: T[] },
>(
  tree: C[],
  currentStyleId: number | null,
  currentSkuId: number | null,
  productType: CatalogProductType | "all",
  path?: { styleSlug?: string | null; skuSlug?: string | null } | null,
): { styleId: number; skuId: number | null } | null {
  if (tree.length === 0) return null;

  if (isSelectionValidInRetailTree(tree, currentStyleId, currentSkuId)) {
    return { styleId: currentStyleId!, skuId: currentSkuId };
  }

  const styleSlug = path?.styleSlug?.toLowerCase().trim();
  const skuSlug = path?.skuSlug?.toLowerCase().trim();
  if (styleSlug && skuSlug) {
    const cat = tree.find((c) => (c.slug || "").toLowerCase() === styleSlug);
    const sub = cat?.subcategories.find((s) =>
      subSlugMatchesRetailPath(s.slug || "", skuSlug),
    );
    if (cat && sub) return { styleId: cat.id, skuId: sub.id };
  }

  if (currentStyleId != null) {
    const cat = tree.find((c) => c.id === currentStyleId);
    if (cat && cat.subcategories.length > 0) {
      return { styleId: cat.id, skuId: cat.subcategories[0].id };
    }
  }

  if (productType !== "all") {
    for (const cat of tree) {
      for (const sub of cat.subcategories) {
        if (resolveCatalogProductType(sub) === productType) {
          return { styleId: cat.id, skuId: sub.id };
        }
      }
    }
  }

  const first = tree[0];
  return { styleId: first.id, skuId: first.subcategories[0]?.id ?? null };
}
