import {
  calculateBreakdown,
  type CatalogPricingOptions,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'

/** ERP / Excel `BoxCharges` or `WithBoxChargesOnly` → `web_products.box_charges`. */
export function getProductBoxCharges(item: Item | null | undefined): number {
  if (!item) return 0
  const n = Number(item.box_charges ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function productHasBoxOption(item: Item | null | undefined): boolean {
  return getProductBoxCharges(item) > 0
}

/** @deprecated WithBoxChargesOnly removed — always false. Use box_charges + with-box photo slot. */
export function productWithBoxChargesOnly(_item: Item | null | undefined): boolean {
  return false
}

/** Excel `MRP RATE (BEHIND BOX)` — informational MRP on product cards when reseller enables it. */
export function getProductMrpBehindBox(item: Item | null | undefined): number {
  if (!item) return 0
  const n = Number(item.mrp_rate_behind_box ?? item.mrpRateBehindBox ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function effectiveIncludeBox(_item: Item, includeBox: boolean): boolean {
  return includeBox
}

/**
 * Gallery slide index for the with-box photo (DualJewelleryProductImage / PDP order):
 * primary → secondary? → box → video?
 */
export function boxImageSlideIndex(item: Item | null | undefined): number | null {
  const boxUrl = String(item?.box_image_url ?? '').trim()
  if (!boxUrl) return null
  /** Slide order: primary (0) → secondary? (1) → box (2) → video? */
  let idx = 0
  if (String(item?.image_url ?? '').trim()) idx += 1
  if (String(item?.secondary_image_url ?? '').trim()) idx += 1
  return idx
}

/** Gifting fixed price incl. optional box charge (catalog cards, PDP, cart). */
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
  const box = effectiveIncludeBox(item, includeBox) ? getProductBoxCharges(item) : 0
  return b.total + box
}
