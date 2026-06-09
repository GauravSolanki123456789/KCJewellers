import {
  calculateBreakdown,
  type CatalogPricingOptions,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'

/** Extra ₹ for optional gift box (`web_products.box_charges` / Excel BoxCharges). */
export function getProductBoxCharges(item: Item | null | undefined): number {
  const n = Number(item?.box_charges ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function productHasBoxOption(item: Item | null | undefined): boolean {
  return getProductBoxCharges(item) > 0
}

/**
 * Gallery slide index for the with-box photo: primary(0), secondary(1), box(2), video(3).
 * Returns null when there is no box charge or no box image URL.
 */
export function boxImageSlideIndex(item: Item | null | undefined): number | null {
  if (!productHasBoxOption(item)) return null
  const hasBoxImage = Boolean(String(item?.box_image_url ?? '').trim())
  if (!hasBoxImage) return null
  let idx = 0
  if (String(item?.image_url ?? '').trim()) idx += 1
  if (String(item?.secondary_image_url ?? '').trim()) idx += 1
  return idx
}

/** Gifting fixed price + optional box charge (incl. GST rules from admin toggle). */
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
  return Math.round(b.total + box)
}
