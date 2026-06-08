/**
 * Shared catalogue pricing — catalogue cards + brochure `markupPercentage` / `discountPercentage`.
 * Keywords: markupPercentage (DB: shared_catalogs.markup_percentage),
 *           discountPercentage (DB: shared_catalogs.discount_percentage).
 */
import {
  calculateBreakdown,
  resolveItemGstRate,
  isGiftingItem,
  productPriceShowsInclGst,
  type CatalogPricingOptions,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'
import {
  compareVariantBySize,
  getDesignGroupKey,
  variantDisplayTitle,
} from '@/lib/product-variants'
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

export function parseDiscountPercentage(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const n =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : Number.parseFloat(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** Apply brochure markup then customer discount on the precise calculated total. */
export function applySharedCatalogPriceAdjustments(
  baseTotal: number,
  markupPercentage: number,
  discountPercentage: number,
): number {
  const mk = parseMarkupPercentage(markupPercentage)
  const disc = parseDiscountPercentage(discountPercentage)
  const afterMarkup = baseTotal * (1 + mk / 100)
  return Math.round(afterMarkup * (1 - disc / 100))
}

/** Price after link markup only (before customer `discountPercentage`). */
export function sharedCatalogMarkedUpBeforeLinkDiscountInr(
  item: Item,
  rates: unknown,
  markupPercentage: number,
  wholesale?: WholesalePricingInput | null,
  giftingGstEnabled?: boolean,
): number {
  const pricingOptions = sharedCatalogPricingOptions(giftingGstEnabled)
  const gst = resolveItemGstRate(item, item.gst_rate, pricingOptions)
  const b = calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
  return Math.round(b.total * (1 + parseMarkupPercentage(markupPercentage) / 100))
}

export type SharedCatalogUnitPrice = {
  unitTotalInr: number
  /** Strikethrough list price when a link or style discount applies. */
  unitCompareAtInr: number | null
  /** Badge label e.g. "25% off" — link discount takes precedence over style promo. */
  discountBadge: string | null
  showInclGst: boolean
}

/** Final + compare-at prices for one shared brochure line (markup → link discount). */
export function computeSharedCatalogUnitPrice(
  item: Item,
  rates: unknown,
  markupPercentage: number,
  wholesale?: WholesalePricingInput | null,
  giftingGstEnabled?: boolean,
  discountPercentage = 0,
): SharedCatalogUnitPrice {
  const pricingOptions = sharedCatalogPricingOptions(giftingGstEnabled)
  const gst = resolveItemGstRate(item, item.gst_rate, pricingOptions)
  const b = calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
  const mk = parseMarkupPercentage(markupPercentage)
  const disc = parseDiscountPercentage(discountPercentage)

  const afterMarkup = b.total * (1 + mk / 100)
  const finalInr = Math.round(afterMarkup * (1 - disc / 100))
  const listAfterMarkup = Math.round(afterMarkup)

  let unitCompareAtInr: number | null = null
  let discountBadge: string | null = null

  if (disc > 0 && listAfterMarkup > finalInr) {
    unitCompareAtInr = listAfterMarkup
    discountBadge = `${Math.round(disc)}% off`
  } else if (
    b.originalTotal != null &&
    b.discountPercent != null &&
    b.discountPercent > 0
  ) {
    const styleList = Math.round(b.originalTotal * (1 + mk / 100))
    if (styleList > finalInr) {
      unitCompareAtInr = styleList
      discountBadge = `${Math.round(b.discountPercent)}% off`
    }
  }

  return {
    unitTotalInr: finalInr,
    unitCompareAtInr,
    discountBadge,
    showInclGst: productPriceShowsInclGst(item, pricingOptions),
  }
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

function sharedCatalogPricingOptions(
  giftingGstEnabled?: boolean,
): CatalogPricingOptions | undefined {
  if (giftingGstEnabled === false) return { giftingGstEnabled: false }
  return undefined
}

/** Catalogue card display total (rounded rupees). */
export function catalogDisplayTotalInr(
  item: Item,
  rates: unknown,
  wholesale?: WholesalePricingInput | null,
  giftingGstEnabled?: boolean,
): number {
  const pricingOptions = sharedCatalogPricingOptions(giftingGstEnabled)
  const gst = resolveItemGstRate(item, item.gst_rate, pricingOptions)
  const b = calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
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
  giftingGstEnabled?: boolean,
  discountPercentage = 0,
): number {
  return computeSharedCatalogUnitPrice(
    item,
    rates,
    markupPercentage,
    wholesale,
    giftingGstEnabled,
    discountPercentage,
  ).unitTotalInr
}

export type SharedCatalogPricingRow = {
  item: Item
  product: SharedCatalogPublicProduct
  unitTotalInr: number
  unitCompareAtInr: number | null
  discountBadge: string | null
  showInclGst: boolean
  markupPercentage: number
  discountPercentage: number
}

export type SharedCatalogGroupedRow = {
  groupKey: string
  displayTitle: string
  variants: SharedCatalogPricingRow[]
}

function sharedCatalogRowKey(row: SharedCatalogPricingRow, index: number): string {
  const b = String(row.product.barcode ?? '').trim()
  if (b) return b
  const s = String(row.product.sku ?? '').trim()
  if (s) return s
  if (row.product.id != null && String(row.product.id).trim()) return String(row.product.id)
  return `i:${index}`
}

/** One grid card per `design_group` for gifting rows with multiple sizes (shared brochure). */
export function groupSharedCatalogPricingRows(
  rows: SharedCatalogPricingRow[],
): SharedCatalogGroupedRow[] {
  const groupBuckets = new Map<string, SharedCatalogPricingRow[]>()
  for (const row of rows) {
    const dg = getDesignGroupKey(row.item)
    if (!dg || !isGiftingItem(row.item)) continue
    const bucket = groupBuckets.get(dg) ?? []
    bucket.push(row)
    groupBuckets.set(dg, bucket)
  }

  for (const [dg, list] of groupBuckets) {
    groupBuckets.set(
      dg,
      [...list].sort((a, b) => compareVariantBySize(a.item, b.item)),
    )
  }

  const seenGroups = new Set<string>()
  const grouped: SharedCatalogGroupedRow[] = []

  rows.forEach((row, index) => {
    const dg = getDesignGroupKey(row.item)
    if (dg && isGiftingItem(row.item)) {
      if (seenGroups.has(dg)) return
      seenGroups.add(dg)
      const variants = groupBuckets.get(dg) ?? [row]
      grouped.push({
        groupKey: dg,
        displayTitle: variantDisplayTitle(variants[0].item),
        variants,
      })
      return
    }
    grouped.push({
      groupKey: sharedCatalogRowKey(row, index),
      displayTitle:
        (row.product.name as string) ||
        row.item.item_name ||
        String(row.product.barcode || row.product.sku || ''),
      variants: [row],
    })
  })

  return grouped
}

export function buildSharedCatalogPricingRows(
  products: SharedCatalogPublicProduct[],
  rates: unknown,
  markupPercentage: number,
  creatorWholesale: SharedCatalogCreatorWholesale | null | undefined,
  giftingGstEnabled?: boolean,
  discountPercentage = 0,
): SharedCatalogPricingRow[] {
  const mk = parseMarkupPercentage(markupPercentage)
  const disc = parseDiscountPercentage(discountPercentage)
  const wholesale = wholesaleInputFromBrochure(creatorWholesale ?? null)
  return products.map((p) => {
    const item = sharedCatalogProductToItem(p)
    const price = computeSharedCatalogUnitPrice(
      item,
      rates,
      mk,
      wholesale,
      giftingGstEnabled,
      disc,
    )
    return {
      item,
      product: p,
      unitTotalInr: price.unitTotalInr,
      unitCompareAtInr: price.unitCompareAtInr,
      discountBadge: price.discountBadge,
      showInclGst: price.showInclGst,
      markupPercentage: mk,
      discountPercentage: disc,
    }
  })
}
