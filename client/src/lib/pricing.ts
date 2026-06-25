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
  /** Gift packaging add-on (₹) — shown as optional "with box" price on storefront. */
  box_charges?: number | string | null
  /** Excel AvgWeight range label e.g. "145-155" — shown on PDP when set. */
  weight_display?: string | null
  /** ERP wastage % — used for billable weight when gross not stored. */
  wastage_pct?: number | null
  /** Optional component weights from Excel (chain + pendant + earring sets). */
  chain_weight?: number | null
  pendant_weight?: number | null
  earring_weight?: number | null
  box_image_url?: string | null
  video_url?: string | null
  design_group?: string | null
  gst_rate?: number
  /** Cart / checkout — customer chose gift box packaging. */
  include_box?: boolean
  /** Gift / reseller — dimensions in inches (e.g. 2.5x5.5). */
  size?: string | null
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

function rateRow(live: unknown, metalType: string): RateRow | null {
  const key = (metalType || '').toLowerCase()
  if (!live) return null
  if (Array.isArray(live)) {
    return (
      (live as RateRow[]).find((r) => (r.metal_type || '').toLowerCase() === key) ?? null
    )
  }
  if (typeof live === 'object' && live !== null) {
    return (live as Record<string, RateRow>)[key] ?? null
  }
  return null
}

function displayRatePerGram(live: unknown, metalType: string, divisor: number): number {
  const row = rateRow(live, metalType)
  if (!row || divisor <= 0) return 0
  return Number(row.display_rate || row.sell_rate || 0) / divisor
}

/** Pick 18K / 22K / 24K gold ₹/g from live rates using product purity. */
function goldRatePerGramForItem(live: unknown, item: Item): number {
  const g24 = displayRatePerGram(live, 'gold', 10)
  const g22Row = displayRatePerGram(live, 'gold_22k', 10)
  const g18Row = displayRatePerGram(live, 'gold_18k', 10)
  const g22 = g22Row > 0 ? g22Row : g24 > 0 ? g24 * 0.916 : 0
  const g18 = g18Row > 0 ? g18Row : g24 > 0 ? g24 * 0.75 : 0

  const p = purityPct(item)
  if (p >= 99 || p >= 995) return g24
  if ((p >= 90 && p <= 93) || Math.abs(p - 91.6) < 1.5 || p === 916) return g22
  if ((p >= 74 && p <= 76) || Math.abs(p - 75) < 1.5 || p === 750) return g18
  if (g24 > 0 && p > 0) return g24 * (p / 100)
  return g24 || g22 || g18
}

/**
 * Return the LIVE 1-GRAM rate for a given metal.
 *
 * The rates payload from the server uses:
 *   gold  → display_rate is per 10 g (24K baseline)
 *   gold_22k / gold_18k → per 10 g when set by reseller
 *   silver → display_rate is per 1 kg
 */
function ratePerGram(live: unknown, metal: string, item?: Item): number {
  const m = (metal || 'silver').toLowerCase()
  if (!live) return 0

  if (m.startsWith('silver')) return displayRatePerGram(live, 'silver', 1000)
  if (item) return goldRatePerGramForItem(live, item)

  return displayRatePerGram(live, 'gold', 10)
}

function netWeight(item: Item): number {
  const n = item.net_weight ?? item.net_wt ?? item.weight ?? (item as { avg_wt?: number }).avg_wt ?? 0
  return Number(n) || 0
}

/** Excel / ERP wastage column — percentage added to net weight for billable metal weight. */
export function parseWastagePercent(item: Item): number | null {
  const raw =
    item.wastage ??
    item.wastage_pct ??
    (item as { wastagePct?: unknown }).wastagePct ??
    (item as { 'Wastage(%)'?: unknown })['Wastage(%)']
  if (raw == null || String(raw).trim() === '') return null
  const n = Number(String(raw).replace(/%/g, '').trim())
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Wastage % from explicit column or derived gross/net (legacy rows). */
export function resolveProductWastagePercent(item: Item | null | undefined): number {
  if (!item || isFixedPriceCatalogItem(item)) return 0
  const explicit = parseWastagePercent(item)
  if (explicit != null && explicit > 0) return snapWastagePercent(explicit)
  const net = netWeight(item)
  const gross = Number(item.gross_weight ?? (item as { grossWeight?: number }).grossWeight ?? 0) || 0
  if (net > 0 && gross > net) {
    return snapWastagePercent(Math.round((gross / net - 1) * 10000) / 100)
  }
  return 0
}

/** Snap 5.01 / 4.99 → 5 — shared with product-metal-specs display. */
export function snapWastagePercent(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0
  const rounded = Math.round(pct)
  if (Math.abs(pct - rounded) <= 0.05) return rounded
  return Math.round(pct * 100) / 100
}

/** Gold/silver billable weight for metal ₹ — full precision (no 3 dp round before × rate). */
function metalBillableWeight(item: Item): number {
  const net = netWeight(item)
  const w = resolveProductWastagePercent(item)
  if (w > 0 && net > 0) return net * (1 + w / 100)
  const gross =
    Number(item.gross_weight ?? (item as { grossWeight?: number }).grossWeight ?? 0) || 0
  if (gross > net && gross > 0) return gross
  return net
}

/** Billable metal weight — display / filters; keeps 3 dp round for legacy gross labels. */
function billableWeight(item: Item): number {
  const net = netWeight(item)
  const bill = metalBillableWeight(item)
  if (bill > net) return Math.round(bill * 1000) / 1000
  return net
}

/** Gold storefront total — round to nearest rupee after GST (tag / manual billing). */
function goldStorefrontTotal(preGstBase: number, gstPct: number): number {
  return Math.round(preGstBase * (1 + gstPct / 100))
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

/** Gift items — show size with "in" suffix when not already present. */
export function formatProductSizeInches(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (/\b(in|inch|inches|")\b/.test(lower) || lower.endsWith('"')) return t
  return `${t} in`
}

export function getCustomerDisplaySize(item: Item | null | undefined): string | null {
  if (!item) return null
  const raw =
    item.size != null
      ? String(item.size)
      : (item as { Size?: string }).Size != null
        ? String((item as { Size?: string }).Size)
        : ''
  const trimmed = raw.trim()
  if (!trimmed) return null
  return formatProductSizeInches(trimmed)
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

/** Weight line for UI/PDF/WhatsApp — prefers `weight_display` range from Excel AvgWeight. */
export function getCustomerDisplayWeightLabel(item: Item | null | undefined): string | null {
  if (!item) return null
  const range = String(item.weight_display ?? '').trim()
  if (range) return `${range} gm`
  const w = getCustomerDisplayWeight(item)
  if (w == null) return null
  return `${Number(w).toFixed(2)} gm`
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
  billable_weight_gm?: number
  wastage_pct?: number
  wastage_weight_gm?: number
  wastage_amount?: number
  net_metal?: number
  /** Standard retail total incl. GST (for B2B strikethrough) */
  wholesale_retail_total?: number
  is_wholesale_price?: boolean
}

export type PriceBreakdown = BreakdownResult

function goldTagFormulaTotal(
  netWt: number,
  metalRate: number,
  wastagePct: number,
  gstPct: number,
  mcPart: number,
  stoneAmt: number,
): number {
  if (mcPart === 0 && stoneAmt === 0 && wastagePct > 0) {
    return Math.round(
      (netWt * metalRate * (100 + wastagePct) * (100 + gstPct)) / 10000,
    )
  }
  const metalPart = Math.floor((netWt * metalRate * (100 + wastagePct)) / 100)
  return goldStorefrontTotal(metalPart + mcPart + stoneAmt, gstPct)
}

function attachWastageFields(
  item: Item,
  isGold: boolean,
  netWt: number,
  metalRate: number,
  metalPart: number,
  row: BreakdownResult,
): BreakdownResult {
  if (!isGold || isFixedPriceCatalogItem(item)) return row
  const w = resolveProductWastagePercent(item)
  const netMetal = Math.floor(netWt * metalRate)
  const wastageAmount = Math.max(0, metalPart - netMetal)
  const billable = metalBillableWeight(item)
  return {
    ...row,
    billable_weight_gm: billable,
    net_metal: netMetal,
    wastage_pct: w > 0 ? w : undefined,
    wastage_weight_gm: w > 0 ? Math.max(0, billable - netWt) : undefined,
    wastage_amount: wastageAmount > 0 ? wastageAmount : undefined,
  }
}

/**
 * FORMULA (web / ERP-synced gold & silver):
 *   billable_weight = gross_weight when set, else net × (1 + Wastage%/100)
 *   Gold metal line = floor(Live1gRate × billable_weight)   — 22K/18K rate from purity
 *   Silver metal    = Live1gRate × billable_weight × purity factor
 *   MC line         = mc_rate × net_weight (PER_GRAM) or fixed mc_rate (FIXED) — optional for gold
 *   Base            = metal line + MC + stone_charges
 *   Gold final      = round(Base × (1 + GST%))                — GST default 3 %
 *   Silver final    = Base × (1 + GST%)                       — unchanged
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

  const netWt = netWeight(item)
  const purity = purityPct(item)
  const isSilver = metal.startsWith('silver')
  const isGold = !isSilver && !metal.startsWith('diamond') && !metal.startsWith('gifting')
  const billWt = isGold || isSilver ? metalBillableWeight(item) : billableWeight(item)
  const rate = ratePerGram(liveRates, metal, isGold ? item : undefined)

  if ((isGold || isSilver) && rate > 0 && netWt > 0 && billWt > 0) {
    const effectivePurity =
      isSilver && purity >= 90 && purity <= 100 ? 100 : isGold ? 100 : purity
    const metalRate = isGold ? rate : rate * (effectivePurity > 0 ? effectivePurity / 100 : 1)
    const wastagePct = isGold ? resolveProductWastagePercent(item) : 0
    const metalPart = isGold
      ? Math.floor((netWt * metalRate * (100 + wastagePct)) / 100)
      : metalRate * billWt
    const mcPart = isGold ? Math.round(mcAmount(item)) : mcAmount(item)
    const stoneAmt = isGold ? Math.round(stone(item)) : stone(item)
    const baseRetail = metalPart + mcPart + stoneAmt
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const categoryDisc = categoryDiscountPct(item)

    if (categoryDisc > 0) {
      const totalBeforeDiscount = isGold
        ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, mcPart, stoneAmt)
        : baseRetail * (1 + gstPct / 100)
      const total = totalBeforeDiscount * (1 - categoryDisc / 100)
      const gstAmt = totalBeforeDiscount - baseRetail
      return attachWastageFields(item, isGold, netWt, metalRate, metalPart, {
        metal: metalPart,
        mc: mcPart,
        stone: stoneAmt,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: baseRetail,
        total,
        originalTotal: totalBeforeDiscount,
        discountPercent: categoryDisc,
        rate_per_gram: metalRate,
        net_weight: netWt,
        wholesale_retail_total: undefined,
        is_wholesale_price: false,
      })
    }

    const markup = accountMarkupPct(wIn, 0)
    const acctDisc = accountDiscountPct(wIn, 0)
    const base = baseRetail * (1 + markup / 100)
    const useGoldTagFormula =
      isGold && !wIn && Math.abs(markup) < 1e-6 && mcPart === 0 && stoneAmt === 0
    const totalBeforeDiscount = isGold
      ? useGoldTagFormula
        ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, 0, 0)
        : goldStorefrontTotal(base, gstPct)
      : base * (1 + gstPct / 100)
    const total =
      acctDisc > 0 ? totalBeforeDiscount * (1 - acctDisc / 100) : totalBeforeDiscount
    const retailBeforePromo = isGold
      ? mcPart === 0 && stoneAmt === 0
        ? goldTagFormulaTotal(netWt, metalRate, wastagePct, gstPct, 0, 0)
        : goldStorefrontTotal(baseRetail, gstPct)
      : baseRetail * (1 + gstPct / 100)
    const gstAmt = totalBeforeDiscount - base
    const wholesaleActive = !!wIn && (acctDisc > 0 || Math.abs(markup) > 1e-6)
    return attachWastageFields(item, isGold, netWt, metalRate, metalPart, {
      metal: metalPart,
      mc: mcPart,
      stone: stoneAmt,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: base,
      total,
      originalTotal: acctDisc > 0 ? totalBeforeDiscount : undefined,
      discountPercent: acctDisc > 0 ? acctDisc : undefined,
      rate_per_gram: metalRate,
      net_weight: netWt,
      wholesale_retail_total: wholesaleActive ? retailBeforePromo : undefined,
      is_wholesale_price: wholesaleActive,
    })
  }

  // Legacy path (platinum and other metals, or missing live rate)
  const wt = billWt > 0 ? billWt : netWt
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
