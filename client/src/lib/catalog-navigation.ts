import type { CatalogMetalKey } from "@/lib/catalog-retail-tags";
import type { Item } from "@/lib/pricing";

/** Maps `web_products.metal_type` to catalogue metal tab (matches METAL_TABS keys). */
export function inferCatalogMetalParam(
  product: Item | null | undefined
): CatalogMetalKey {
  const m = (product?.metal_type ?? "").toString().toLowerCase();
  if (m.includes("gifting")) return "gifting";
  if (m.includes("silver")) return "silver";
  if (m.includes("diamond")) return "diamond";
  if (m.includes("gold")) return "gold";
  return "gold";
}
