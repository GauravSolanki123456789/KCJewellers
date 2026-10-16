import { CATALOG_METAL_KEYS, type CatalogMetalKey } from "@/lib/catalog-metal-family";
import { CATALOG_METAL_LABELS } from "@/lib/catalog-retail-tags";
import { productMatchesMetal } from "@/lib/catalog-product-filters";
import {
  buildCatalogMetalPath,
  buildCatalogSegmentPath,
} from "@/lib/catalog-paths";
import { CATALOG_PATH, RATES_PATH } from "@/lib/routes";
import type { CatalogTreeCategory } from "@/app/catalog/catalog-data-context";

export type StorefrontCatalogLinkOption = {
  group: string;
  label: string;
  href: string;
};

function categoryHasMetal(cat: CatalogTreeCategory, metal: CatalogMetalKey): boolean {
  for (const sub of cat.subcategories || []) {
    if ((sub.products || []).some((p) => productMatchesMetal(p, metal))) return true;
  }
  return false;
}

/** Links resellers can paste into menu tiles — scoped to categories that have products. */
export function listStorefrontCatalogLinkOptions(
  categories: CatalogTreeCategory[],
): StorefrontCatalogLinkOption[] {
  const out: StorefrontCatalogLinkOption[] = [
    { group: "General", label: "Full catalogue", href: CATALOG_PATH },
    { group: "General", label: "Today's rates", href: RATES_PATH },
  ];

  for (const metal of CATALOG_METAL_KEYS) {
    if (categories.some((c) => categoryHasMetal(c, metal))) {
      out.push({
        group: "Shop by metal",
        label: CATALOG_METAL_LABELS[metal],
        href: buildCatalogMetalPath(metal),
      });
    }
  }

  for (const cat of categories) {
    for (const sub of cat.subcategories || []) {
      for (const metal of CATALOG_METAL_KEYS) {
        const count = (sub.products || []).filter((p) => productMatchesMetal(p, metal)).length;
        if (!count) continue;
        const slug = cat.slug || "";
        const subSlug = sub.slug || "";
        if (!slug || !subSlug) continue;
        out.push({
          group: CATALOG_METAL_LABELS[metal],
          label: sub.name ? `${cat.name} · ${sub.name}` : cat.name,
          href: buildCatalogSegmentPath(metal, slug, subSlug),
        });
      }
    }
  }

  return out;
}
