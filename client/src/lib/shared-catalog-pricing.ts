/**
 * Shared catalogue pricing — same basis as catalogue cards + brochure `markupPercentage`.
 * Keyword: markupPercentage (DB: shared_catalogs.markup_percentage).
 */
import {
  calculateBreakdown,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'
import type {
  SharedCatalogCreatorWholesale,
  SharedCatalogPublicProduct,
} from '@/lib/shared-catalog-api'

export function parseMarkupPercentage(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const n =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : Number.parseFloat(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1000, n))
}

export function sharedCatalogProductToItem(p: SharedCatalogPublicProduct): Item {
  const gst =
    typeof p.gst_rate === 'number' && Number.isFinite(p.gst_rate) ? p.gst_rate : 3
  return {
    ...p,
    item_name: (p.name as string) || undefined,
    gst_rate: gst,
  }
}

export function wholesaleInputFromBrochure(
  cp: SharedCatalogCreatorWholesale | null | undefined,
): WholesalePricingInput | null {
  if (!cp) return null
  const w: WholesalePricingInput = {
    wholesale_making_charge_discount_percent:
      Number(cp.wholesale_making_charge_discount_percent) || 0,
    wholesale_markup_percent: Number(cp.wholesale_markup_percent) || 0,
  }
  if (
    Math.abs(w.wholesale_making_charge_discount_percent) <= 1e-9 &&
    Math.abs(w.wholesale_markup_percent) <= 1e-9
  ) {
    return null
  }
  return w
}

/** Catalogue card display total incl. GST (rounded rupees). */
export function catalogDisplayTotalInr(
  item: Item,
  rates: unknown,
  wholesale?: WholesalePricingInput | null,
): number {
  const gst = Number(item.gst_rate ?? 3) || 3
  const b = calculateBreakdown(item, rates, gst, wholesale ?? undefined)
  return Math.round(b.total)
}

/**
 * Brochure line price incl. GST after `markupPercentage` on the precise calculated total.
 * Matches ProductCard (Math.round base) then applies markup on the unrounded total so live
 * rates + wholesale + category discount stay consistent with the main catalogue.
 */
export function sharedCatalogMarkedUpTotalInr(
  item: Item,
  rates: unknown,
  markupPercentage: number,
  wholesale?: WholesalePricingInput | null,
): number {
  const gst = Number(item.gst_rate ?? 3) || 3
  const mk = parseMarkupPercentage(markupPercentage)
  const b = calculateBreakdown(item, rates, gst, wholesale ?? undefined)
  return Math.round(b.total * (1 + mk / 100))
}

export type SharedCatalogPricingRow = {
  item: Item
  product: SharedCatalogPublicProduct
  unitTotalInr: number
  markupPercentage: number
}

export function buildSharedCatalogPricingRows(
  products: SharedCatalogPublicProduct[],
  rates: unknown,
  markupPercentage: number,
  creatorWholesale: SharedCatalogCreatorWholesale | null | undefined,
): SharedCatalogPricingRow[] {
  const mk = parseMarkupPercentage(markupPercentage)
  const wholesale = wholesaleInputFromBrochure(creatorWholesale ?? null)
  return products.map((p) => {
    const item = sharedCatalogProductToItem(p)
    const unitTotalInr = sharedCatalogMarkedUpTotalInr(item, rates, mk, wholesale)
    return { item, product: p, unitTotalInr, markupPercentage: mk }
  })
}
