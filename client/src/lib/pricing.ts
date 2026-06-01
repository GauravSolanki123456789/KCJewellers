/**
 * Unified Product/Item type used across the entire application.
 */
export type Item = {
  id?: string | number
  barcode?: string
  sku?: string
  item_name?: string
  short_name?: string
  style_code?: string
  metal_type?: string
  fixed_price?: number
  net_wt?: number
  net_weight?: number
  gross_weight?: number
  weight?: number
  purity?: number | string
  mc_type?: string
  mc_rate?: number
  mc_value?: number
  stone_charges?: number
  design_group?: string | null
  gst_rate?: number
  image_url?: string
  secondary_image_url?: string | null
  pcs?: number
  discount_percentage?: number
  [key: string]: unknown
}

/** Matches `users.wholesale_*` — account disc % (not stacked on retail promos) and optional markup. */
export type WholesalePricingInput = {
  wholesale_making_charge_discount_percent: number
  wholesale_markup_percent: number
}

type RateRow = { metal_type?: string; display_rate?: number; sell_rate?: number }

function clampPct(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(lo, Math.min(hi, n))
}

function wholesaleIsActive(w: WholesalePricingInput | null | undefined): boolean {
  if (!w) return false
  return (
    Math.abs(w.wholesale_making_charge_discount_percent) > 1e-6 ||
    Math.abs(w.wholesale_markup_percent) > 1e-6
  )
}

/** Style-level retail promo from `web_categories.discount_percentage`. */
function categoryDiscountPct(item: Item): number {
  const n = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
  return n > 0 ? clampPct(n, 0, 100) : 0
}

/**
 * Reseller / wholesale account discount (`users.wholesale_making_charge_discount_percent`).
 * Skipped when the product style already has a retail promo — resellers pay the same promo price.
 */
function accountDiscountPct(
  wholesale: WholesalePricingInput | null | undefined,
  categoryDiscount: number,
): number {
  if (!wholesale || categoryDiscount > 0) return 0
  return clampPct(wholesale.wholesale_making_charge_discount_percent, -100, 100)
}

function accountMarkupPct(
  wholesale: WholesalePricingInput | null | undefined,
  categoryDiscount: number,
): number {
  if (!wholesale || categoryDiscount > 0) return 0
  return Number(wholesale.wholesale_markup_percent ?? 0) || 0
}

/**
 * Return the LIVE 1-GRAM rate for a given metal.
 *
 * The rates payload from the server uses:
 *   gold  → display_rate is per 10 g
 *   silver → display_rate is per 1 kg
 *
 * This helper normalises both to per-gram.
 */
function ratePerGram(live: unknown, metal: string): number {
  const m = (metal || 'silver').toLowerCase()
  if (!live) return 0

  let rawRate = 0
  const searchKey = m.startsWith('silver') ? 'silver' : 'gold'

  if (Array.isArray(live)) {
    const row = (live as RateRow[]).find(
      (r) => (r.metal_type || '').toLowerCase() === searchKey,
    )
    if (row) rawRate = Number(row.display_rate || row.sell_rate || 0)
  } else if (typeof live === 'object' && live !== null) {
    const row = (live as Record<string, RateRow>)[searchKey]
    if (row) rawRate = Number(row.display_rate || row.sell_rate || 0)
  }

  if (m.startsWith('silver')) return rawRate / 1000
  return rawRate / 10
}

function netWeight(item: Item): number {
  const n = item.net_weight ?? item.net_wt ?? item.weight ?? (item as { avg_wt?: number }).avg_wt ?? 0
  return Number(n) || 0
}

/** Consistent weight getter: net_wt ?? net_weight ?? weight ?? avg_wt. Returns null if none set. */
export function getItemWeight(item: Item | null | undefined): number | null {
  if (!item) return null
  const n = item.net_wt ?? item.net_weight ?? item.weight ?? (item as { avg_wt?: number }).avg_wt
  if (n == null || (typeof n === 'string' && n === '')) return null
  const num = Number(n)
  return isNaN(num) ? null : num
}

/**
 * Net/gross weight for catalogue PDF when net is missing (ERP sometimes only has gross).
 * Does not change cart/checkout — use `getItemWeight` there.
 */
export function getItemWeightWithGrossFallback(
  item: Item | null | undefined,
): number | null {
  const net = getItemWeight(item)
  if (net != null && net > 0) return net
  const g = (item as { gross_weight?: number }).gross_weight
  if (g == null) return net
  const num = Number(g)
  if (isNaN(num) || num <= 0) return net
  return num
}

/** Returns true if item metal_type is diamond (case-insensitive, supports 'diamond', 'diamonds', etc.) */
export function isDiamondItem(item: Item | null | undefined): boolean {
  const mt = (item?.metal_type ?? '').toString().toLowerCase()
  return mt.startsWith('diamond') || mt.includes('diamond')
}

/** Returns true if item metal_type is gifting (fixed-price catalogue, no live metal rate). */
export function isGiftingItem(item: Item | null | undefined): boolean {
  const mt = (item?.metal_type ?? '').toString().toLowerCase()
  return mt.startsWith('gifting') || mt.includes('gifting')
}

/** Diamond or gifting — uses `fixed_price` instead of live rates (cart, checkout, filters). */
export function isFixedPriceCatalogItem(item: Item | null | undefined): boolean {
  return isDiamondItem(item) || isGiftingItem(item)
}

/** Storefront pricing toggles from `app_settings` (admin). */
export type CatalogPricingOptions = {
  /** When false, gift items use fixed_price with 0% GST. Defaults to true. */
  giftingGstEnabled?: boolean
}

/** Effective GST % for an item — respects gift-items admin toggle. */
export function resolveItemGstRate(
  item: Item,
  gstRate?: number,
  pricingOptions?: CatalogPricingOptions,
): number {
  if (isGiftingItem(item) && pricingOptions?.giftingGstEnabled === false) return 0
  return Number(gstRate ?? item.gst_rate ?? 3) || 3
}

/** Whether storefront should label the price as GST-inclusive. */
export function productPriceShowsInclGst(
  item: Item,
  pricingOptions?: CatalogPricingOptions,
): boolean {
  return resolveItemGstRate(item, undefined, pricingOptions) > 0
}

/** Gifting only: show purity only when ERP sent a real value (not null / 0 / 100 placeholder). */
export function getCustomerDisplayPurity(
  item: Item | null | undefined,
): string | number | null {
  if (!item) return null
  const raw = item.purity
  if (raw == null || raw === '') return null
  if (isGiftingItem(item)) {
    const n = Number(raw)
    if (Number.isNaN(n) || n === 0 || n === 100) return null
  }
  return raw
}

/** Storefront weight: gifting rows hide 0 / missing net weight. */
export function getCustomerDisplayWeight(item: Item | null | undefined): number | null {
  const w = getItemWeight(item)
  if (isGiftingItem(item)) {
    if (w == null || w <= 0) return null
    return w
  }
  return w
}

/**
 * Catalogue / shared brochure weight — gross fallback except gifting (no 0 gm display).
 */
export function getCustomerDisplayWeightWithGrossFallback(
  item: Item | null | undefined,
): number | null {
  if (isGiftingItem(item)) return getCustomerDisplayWeight(item)
  return getItemWeightWithGrossFallback(item)
}

function purityPct(item: Item): number {
  const p = Number(item.purity || 0)
  if (!p || p <= 0) return 0
  if (p >= 100) return p / 10   // fineness e.g. 916 → 91.6 %
  if (p > 1) return p            // already a percentage e.g. 92.5
  return p * 100                 // decimal e.g. 0.916 → 91.6
}

function mcAmount(item: Item): number {
  const type = (item.mc_type || 'PER_GRAM').toUpperCase()
  const val = Number(item.mc_rate ?? item.mc_value ?? 0) || 0
  const wt = netWeight(item)
  return type === 'FIXED' ? val : wt * val
}

function stone(item: Item): number {
  return Number(item.stone_charges || 0) || 0
}

type BreakdownResult = {
  metal: number
  mc: number
  stone: number
  cgst: number
  sgst: number
  taxable: number
  total: number
  originalTotal?: number
  discountPercent?: number
  rate_per_gram?: number
  net_weight?: number
  /** Standard retail total incl. GST (for B2B strikethrough) */
  wholesale_retail_total?: number
  is_wholesale_price?: boolean
}

/**
 * FORMULA (web / ERP-synced products):
 *   PerGramCost  = Live1gRate × (purity / 100)
 *                  (silver with purity ≈ 92.5 → treat purity as 100)
 *   Base         = (PerGramCost + mc_rate) × net_weight
 *   FinalPrice   = Base × (1 + GST%)          — GST default 3 %
 *
 * B2B wholesale / RESELLER: optional account `disc %` and markup on the metal+MC line.
 * Account disc % is not stacked on styles that already have a retail promo discount.
 *
 * DIAMOND / GIFTING: use fixed_price only, ignore live rates (ERP `fixedPrice` → DB fixed_price).
 * Legacy (non-web) products fall through to the classic formula.
 */
export function calculateBreakdown(
  item: Item,
  liveRates: unknown,
  gstRate?: number,
  wholesale?: WholesalePricingInput | null,
  pricingOptions?: CatalogPricingOptions,
): BreakdownResult {
  const metal = (item.metal_type || 'silver').toLowerCase()
  const wIn = wholesale && wholesaleIsActive(wholesale) ? wholesale : null

  // Fixed-price catalogue (diamond, gifting): bypass live rate/weight. Use fixed_price if set, else mc_rate + stone_charges
  if (metal.startsWith('diamond') || metal.startsWith('gifting')) {
    const fixedPrice = Number(item.fixed_price ?? 0) || 0
    const mcRate = Number(item.mc_rate ?? 0) || 0
    const stoneAmt = Number(item.stone_charges ?? 0) || 0
    const basePrice = fixedPrice > 0 ? fixedPrice : mcRate + stoneAmt
    const categoryDisc = categoryDiscountPct(item)
    const gstPct = resolveItemGstRate(item, gstRate, pricingOptions)

    if (categoryDisc > 0) {
      const taxable = basePrice * (1 - categoryDisc / 100)
      const gstAmt = taxable * (gstPct / 100)
      const total = taxable + gstAmt
      const originalTotal = basePrice * (1 + gstPct / 100)
      return {
        metal: 0,
        mc: 0,
        stone: 0,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable,
        total,
        originalTotal,
        discountPercent: categoryDisc,
        wholesale_retail_total: undefined,
        is_wholesale_price: false,
      }
    }

    const markup = accountMarkupPct(wIn, 0)
    const acctDisc = accountDiscountPct(wIn, 0)
    let taxable = basePrice * (1 + markup / 100)
    const gstAmt = taxable * (gstPct / 100)
    const totalBeforeDiscount = taxable + gstAmt
    const total =
      acctDisc > 0 ? totalBeforeDiscount * (1 - acctDisc / 100) : totalBeforeDiscount
    const retailTotal = basePrice * (1 + gstPct / 100)
    const wholesaleActive = !!wIn && (acctDisc > 0 || Math.abs(markup) > 1e-6)
    return {
      metal: 0,
      mc: 0,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable,
      total,
      originalTotal: acctDisc > 0 ? totalBeforeDiscount : undefined,
      discountPercent: acctDisc > 0 ? acctDisc : undefined,
      wholesale_retail_total: wholesaleActive ? retailTotal : undefined,
      is_wholesale_price: wholesaleActive,
    }
  }

  const rate = ratePerGram(liveRates, metal)
  const wt = netWeight(item)
  const purity = purityPct(item)
  const mcRate = Number(item.mc_rate ?? 0) || 0

  const hasMcRate = (item as Record<string, unknown>).mc_rate != null

  if (hasMcRate && (rate > 0 || mcRate > 0) && wt > 0) {
    const isSilver = metal.startsWith('silver')
    const effectivePurity =
      isSilver && purity >= 90 && purity <= 100 ? 100 : purity

    const adjustedRate =
      rate * (effectivePurity > 0 ? effectivePurity / 100 : 1)
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const categoryDisc = categoryDiscountPct(item)
    const perGramCostRetail = adjustedRate + mcRate
    const baseRetail = perGramCostRetail * wt

    if (categoryDisc > 0) {
      const totalBeforeDiscount = baseRetail * (1 + gstPct / 100)
      const total = totalBeforeDiscount * (1 - categoryDisc / 100)
      const gstAmt = totalBeforeDiscount - baseRetail
      return {
        metal: adjustedRate * wt,
        mc: mcRate * wt,
        stone: 0,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: baseRetail,
        total,
        originalTotal: totalBeforeDiscount,
        discountPercent: categoryDisc,
        rate_per_gram: adjustedRate,
        net_weight: wt,
        wholesale_retail_total: undefined,
        is_wholesale_price: false,
      }
    }

    const markup = accountMarkupPct(wIn, 0)
    const acctDisc = accountDiscountPct(wIn, 0)
    const base = baseRetail * (1 + markup / 100)
    const totalBeforeDiscount = base * (1 + gstPct / 100)
    const total =
      acctDisc > 0 ? totalBeforeDiscount * (1 - acctDisc / 100) : totalBeforeDiscount
    const retailBeforePromo = baseRetail * (1 + gstPct / 100)
    const gstAmt = totalBeforeDiscount - base
    const wholesaleActive = !!wIn && (acctDisc > 0 || Math.abs(markup) > 1e-6)
    return {
      metal: adjustedRate * wt,
      mc: mcRate * wt,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: base,
      total,
      originalTotal: acctDisc > 0 ? totalBeforeDiscount : undefined,
      discountPercent: acctDisc > 0 ? acctDisc : undefined,
      rate_per_gram: adjustedRate,
      net_weight: wt,
      wholesale_retail_total: wholesaleActive ? retailBeforePromo : undefined,
      is_wholesale_price: wholesaleActive,
    }
  }

  // Legacy path (non-web products without mc_rate on the row)
  const metalVal = wt * rate * (purity / 100)
  const mc = mcAmount(item)
  const stoneAmt = stone(item)
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const categoryDisc = categoryDiscountPct(item)
  const baseRetail = metalVal + mc + stoneAmt

  if (categoryDisc > 0) {
    const retailCgst = gst ? baseRetail * (gst / 200) : 0
    const retailSgst = gst ? baseRetail * (gst / 200) : 0
    const retailBeforePromo = baseRetail + retailCgst + retailSgst
    const total = retailBeforePromo * (1 - categoryDisc / 100)
    return {
      metal: metalVal,
      mc,
      stone: stoneAmt,
      cgst: retailCgst,
      sgst: retailSgst,
      taxable: baseRetail,
      total,
      originalTotal: retailBeforePromo,
      discountPercent: categoryDisc,
      rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
      net_weight: wt,
      wholesale_retail_total: undefined,
      is_wholesale_price: false,
    }
  }

  const markup = accountMarkupPct(wIn, 0)
  const acctDisc = accountDiscountPct(wIn, 0)
  let taxable = baseRetail * (1 + markup / 100)
  const cgst = gst ? taxable * (gst / 200) : 0
  const sgst = gst ? taxable * (gst / 200) : 0
  const totalBeforeDiscount = taxable + cgst + sgst
  const total =
    acctDisc > 0 ? totalBeforeDiscount * (1 - acctDisc / 100) : totalBeforeDiscount
  const retailCgst = gst ? baseRetail * (gst / 200) : 0
  const retailSgst = gst ? baseRetail * (gst / 200) : 0
  const retailBeforePromo = baseRetail + retailCgst + retailSgst
  const wholesaleActive = !!wIn && (acctDisc > 0 || Math.abs(markup) > 1e-6)
  return {
    metal: metalVal,
    mc,
    stone: stoneAmt,
    cgst,
    sgst,
    taxable,
    total,
    originalTotal: acctDisc > 0 ? totalBeforeDiscount : undefined,
    discountPercent: acctDisc > 0 ? acctDisc : undefined,
    rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
    net_weight: wt,
    wholesale_retail_total: wholesaleActive ? retailBeforePromo : undefined,
    is_wholesale_price: wholesaleActive,
  }
}
