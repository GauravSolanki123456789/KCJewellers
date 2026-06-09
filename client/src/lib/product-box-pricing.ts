import {
  calculateBreakdown,
  type CatalogPricingOptions,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'

/** Gift-box surcharge from ERP / Excel `BoxCharges` → `web_products.box_charges`. */
export function getProductBoxCharges(item: Item | null | undefined): number {
  if (!item) return 0
  const n = Number(item.box_charges ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function productHasBoxOption(item: Item | null | undefined): boolean {
  return getProductBoxCharges(item) > 0
}

/**
 * Index of the with-box slide in `DualJewelleryProductImage` / PDP gallery
 * (primary → secondary → box → video). Null when no box photo is stored yet.
 */
export function boxImageSlideIndex(item: Item | null | undefined): number | null {
  if (!item) return null
  const hasBoxImg = Boolean(String(item.box_image_url ?? '').trim())
  if (!hasBoxImg) return null

  let idx = 0
  if (String(item.image_url ?? '').trim()) idx++
  if (String(item.secondary_image_url ?? '').trim()) idx++
  return idx
}

/** Gifting fixed price incl. optional box surcharge (used on cards, PDP, shared catalogue). */
export function giftingDisplayTotal(
  item: Item,
  liveRates: unknown,
  includeBox: boolean,
  wholesale?: WholesalePricingInput | null,
  pricingOptions?: CatalogPricingOptions,
): number {
  const b = calculateBreakdown(
    item,
    liveRates,
    item.gst_rate,
    wholesale,
    pricingOptions,
  )
  const box = includeBox ? getProductBoxCharges(item) : 0
  return b.total + box
}
