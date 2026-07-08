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
  calculateBreakdownWithSlab,
  formatSlabDiscountLines,
  parseResellerSlabSettings,
  tierSettingsForSlab,
  type CatalogSlabKind,
  type ResellerSlabSettings,
  type SharedCatalogSlabContext,
} from '@/lib/catalog-slab-pricing'
import {
  compareVariantBySize,
  getVariantGroupKey,
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
  /** Strikethrough list price when a link, style, or slab discount applies. */
  unitCompareAtInr: number | null
  /** Badge label e.g. "25% off" — link discount takes precedence over style promo. */
  discountBadge: string | null
  showInclGst: boolean
  /** Slab-specific savings lines (MC / wastage / rate) for brochure, PDF, WhatsApp. */
  slabDiscountLines: string[]
  /** Rupees saved vs retail (before slab) after markup + link discount. */
  savingsInr: number | null
}

/** Final + compare-at prices for one shared brochure line (markup → link discount). */
export function computeSharedCatalogUnitPrice(
  item: Item,
  rates: unknown,
  markupPercentage: number,
  wholesale?: WholesalePricingInput | null,
  giftingGstEnabled?: boolean,
  discountPercentage = 0,
  slab?: SharedCatalogSlabContext | null,
): SharedCatalogUnitPrice {
  const pricingOptions = sharedCatalogPricingOptions(giftingGstEnabled)
  const gst = resolveItemGstRate(item, item.gst_rate, pricingOptions)
  const b = breakdownForSharedCatalog(
    item,
    rates,
    gst,
    wholesale,
    pricingOptions,
    slab ?? null,
  )
  const mk = parseMarkupPercentage(markupPercentage)
  const disc = parseDiscountPercentage(discountPercentage)

  const afterMarkup = b.total * (1 + mk / 100)
  const finalInr = Math.round(afterMarkup * (1 - disc / 100))
  const listAfterMarkup = Math.round(afterMarkup)

  let unitCompareAtInr: number | null = null
  let discountBadge: string | null = null
  let slabDiscountLines: string[] = []
  let savingsInr: number | null = null

  const slabActive = slab && slab.kind !== 'standard'

  if (slabActive) {
    slabDiscountLines = formatSlabDiscountLines(slab, item)
    const bRetail = calculateBreakdown(item, rates, gst, null, pricingOptions)
    const retailFinal = Math.round(bRetail.total * (1 + mk / 100) * (1 - disc / 100))
    if (retailFinal > finalInr) {
      unitCompareAtInr = retailFinal
      savingsInr = retailFinal - finalInr
      const configuredPct =
        b.discountPercent != null && b.discountPercent > 0
          ? Math.round(b.discountPercent)
          : null
      discountBadge =
        configuredPct != null
          ? `${configuredPct}% off`
          : `${Math.round(100 * (1 - finalInr / retailFinal))}% off`
    }
  } else if (disc > 0 && listAfterMarkup > finalInr) {
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
    slabDiscountLines,
    savingsInr,
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

export type SharedCatalogSlabPayload = {
  pricingSlab?: CatalogSlabKind
  slabSettingsSnapshot?: ResellerSlabSettings | null
  wholesaleGoldRatePerG?: number | null
  wholesaleSilverRatePerG?: number | null
}

export function buildSharedCatalogSlabContext(
  payload: SharedCatalogSlabPayload | null | undefined,
): SharedCatalogSlabContext | null {
  if (!payload?.pricingSlab || payload.pricingSlab === 'standard') return null
  const kind = payload.pricingSlab
  const settings = tierSettingsForSlab(
    parseResellerSlabSettings(payload.slabSettingsSnapshot),
    kind,
  )
  return {
    kind,
    settings,
    wholesaleGoldRatePerG: payload.wholesaleGoldRatePerG,
    wholesaleSilverRatePerG: payload.wholesaleSilverRatePerG,
  }
}

function breakdownForSharedCatalog(
  item: Item,
  rates: unknown,
  gst: number,
  wholesale: WholesalePricingInput | null | undefined,
  pricingOptions: CatalogPricingOptions | undefined,
  slab: SharedCatalogSlabContext | null,
): ReturnType<typeof calculateBreakdown> {
  if (slab) {
    return calculateBreakdownWithSlab(
      item,
      rates,
      gst,
      slab,
      null,
      pricingOptions,
    )
  }
  return calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
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
  slabDiscountLines: string[]
  savingsInr: number | null
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

/** One grid card per subcategory + `design_group` for gifting size variants (shared brochure). */
export function groupSharedCatalogPricingRows(
  rows: SharedCatalogPricingRow[],
): SharedCatalogGroupedRow[] {
  const groupBuckets = new Map<string, SharedCatalogPricingRow[]>()
  for (const row of rows) {
    const groupKey = getVariantGroupKey(row.item)
    if (!groupKey || !isGiftingItem(row.item)) continue
    const bucket = groupBuckets.get(groupKey) ?? []
    bucket.push(row)
    groupBuckets.set(groupKey, bucket)
  }

  for (const [groupKey, list] of groupBuckets) {
    groupBuckets.set(
      groupKey,
      [...list].sort((a, b) => compareVariantBySize(a.item, b.item)),
    )
  }

  const seenGroups = new Set<string>()
  const grouped: SharedCatalogGroupedRow[] = []

  rows.forEach((row, index) => {
    const groupKey = getVariantGroupKey(row.item)
    if (groupKey && isGiftingItem(row.item)) {
      if (seenGroups.has(groupKey)) return
      seenGroups.add(groupKey)
      const variants = groupBuckets.get(groupKey) ?? [row]
      grouped.push({
        groupKey,
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
  slabPayload?: SharedCatalogSlabPayload | null,
): SharedCatalogPricingRow[] {
  const mk = parseMarkupPercentage(markupPercentage)
  const disc = parseDiscountPercentage(discountPercentage)
  const wholesale = slabPayload?.pricingSlab && slabPayload.pricingSlab !== 'standard'
    ? null
    : wholesaleInputFromBrochure(creatorWholesale ?? null)
  const slab = buildSharedCatalogSlabContext(slabPayload ?? null)
  const rows: SharedCatalogPricingRow[] = []
  for (const p of products) {
    try {
      const item = sharedCatalogProductToItem(p)
      const price = computeSharedCatalogUnitPrice(
        item,
        rates,
        mk,
        wholesale,
        giftingGstEnabled,
        disc,
        slab,
      )
      rows.push({
        item,
        product: p,
        unitTotalInr: Number.isFinite(price.unitTotalInr) ? price.unitTotalInr : 0,
        unitCompareAtInr: price.unitCompareAtInr,
        discountBadge: price.discountBadge,
        showInclGst: price.showInclGst,
        slabDiscountLines: price.slabDiscountLines,
        savingsInr: price.savingsInr,
        markupPercentage: mk,
        discountPercentage: disc,
      })
    } catch (e) {
      console.warn('shared catalog pricing row skipped', p?.barcode ?? p?.sku, e)
    }
  }
  return rows
}
