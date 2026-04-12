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
  weight?: number
  purity?: number | string
  mc_type?: string
  mc_rate?: number
  mc_value?: number
  stone_charges?: number
  gst_rate?: number
  image_url?: string
  pcs?: number
  discount_percentage?: number
  [key: string]: unknown
}

/** Matches `users.wholesale_*` — % off making charge and % adjustment on metal+MC line (before GST). */
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

/** Returns true if item metal_type is diamond (case-insensitive, supports 'diamond', 'diamonds', etc.) */
export function isDiamondItem(item: Item | null | undefined): boolean {
  const mt = (item?.metal_type ?? '').toString().toLowerCase()
  return mt.startsWith('diamond') || mt.includes('diamond')
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
 * B2B wholesale: optional `wholesale` applies making-charge discount and/or markup on the metal+MC line.
 *
 * DIAMOND: metal_type 'diamond' or 'diamonds' → use fixed_price only, ignore live rates.
 * Legacy (non-web) products fall through to the classic formula.
 */
export function calculateBreakdown(
  item: Item,
  liveRates: unknown,
  gstRate?: number,
  wholesale?: WholesalePricingInput | null,
): BreakdownResult {
  const metal = (item.metal_type || 'silver').toLowerCase()
  const wIn = wholesale && wholesaleIsActive(wholesale) ? wholesale : null

  // Diamond products: bypass live rate/weight. Use fixed_price if set, else mc_rate + stone_charges
  if (metal.startsWith('diamond')) {
    const fixedPrice = Number(item.fixed_price ?? 0) || 0
    const mcRate = Number(item.mc_rate ?? 0) || 0
    const stoneAmt = Number(item.stone_charges ?? 0) || 0
    let basePrice = fixedPrice > 0 ? fixedPrice : mcRate + stoneAmt
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
    let taxable = discountPct > 0 ? basePrice * (1 - discountPct / 100) : basePrice
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    let retailTaxable = taxable
    if (wIn) {
      retailTaxable = taxable
      taxable = taxable * (1 + wIn.wholesale_markup_percent / 100)
    }
    const gstAmt = taxable * (gstPct / 100)
    const cgst = gstAmt / 2
    const sgst = gstAmt / 2
    const total = taxable + gstAmt
    const originalTotal = discountPct > 0 ? basePrice + (basePrice * (gstPct / 100)) : undefined
    const retailGst = retailTaxable * (gstPct / 100)
    const retailTotal = retailTaxable + retailGst
    return {
      metal: 0,
      mc: 0,
      stone: 0,
      cgst,
      sgst,
      taxable,
      total,
      originalTotal,
      discountPercent: discountPct > 0 ? discountPct : undefined,
      wholesale_retail_total: wIn ? retailTotal : undefined,
      is_wholesale_price: !!wIn,
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
    const mcDisc = wIn ? clampPct(wIn.wholesale_making_charge_discount_percent, -100, 100) : 0
    const effectiveMcRate = mcRate * (1 - mcDisc / 100)
    const perGramCostRetail = adjustedRate + mcRate
    const perGramCost = adjustedRate + effectiveMcRate
    const markup = wIn ? wIn.wholesale_markup_percent : 0
    const baseRetail = perGramCostRetail * wt
    const base = perGramCost * wt * (1 + markup / 100)
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const totalBeforeDiscount = base * (1 + gstPct / 100)
    const gstAmt = totalBeforeDiscount - base
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
    const total = discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
    const retailBeforePromo = baseRetail * (1 + gstPct / 100)
    const retailTotal = discountPct > 0 ? retailBeforePromo * (1 - discountPct / 100) : retailBeforePromo
    return {
      metal: adjustedRate * wt,
      mc: effectiveMcRate * wt,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: base,
      total,
      originalTotal: discountPct > 0 ? totalBeforeDiscount : undefined,
      discountPercent: discountPct > 0 ? discountPct : undefined,
      rate_per_gram: adjustedRate,
      net_weight: wt,
      wholesale_retail_total: wIn ? retailTotal : undefined,
      is_wholesale_price: !!wIn,
    }
  }

  // Legacy path (non-web products without mc_rate on the row)
  const metalVal = wt * rate * (purity / 100)
  const mc = mcAmount(item)
  const mcDisc = wIn ? clampPct(wIn.wholesale_making_charge_discount_percent, -100, 100) : 0
  const mcEff = mc * (1 - mcDisc / 100)
  const stoneAmt = stone(item)
  const baseRetail = metalVal + mc + stoneAmt
  let taxable = metalVal + mcEff + stoneAmt
  if (wIn) taxable *= (1 + wIn.wholesale_markup_percent / 100)
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const cgst = gst ? taxable * (gst / 200) : 0
  const sgst = gst ? taxable * (gst / 200) : 0
  const totalBeforeDiscount = taxable + cgst + sgst
  const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
  const total = discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
  const retailTaxable = baseRetail
  const retailCgst = gst ? retailTaxable * (gst / 200) : 0
  const retailSgst = gst ? retailTaxable * (gst / 200) : 0
  const retailBeforePromo = retailTaxable + retailCgst + retailSgst
  const retailTotal = discountPct > 0 ? retailBeforePromo * (1 - discountPct / 100) : retailBeforePromo
  return {
    metal: metalVal,
    mc: mcEff,
    stone: stoneAmt,
    cgst,
    sgst,
    taxable,
    total,
    originalTotal: discountPct > 0 ? totalBeforeDiscount : undefined,
    discountPercent: discountPct > 0 ? discountPct : undefined,
    rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
    net_weight: wt,
    wholesale_retail_total: wIn ? retailTotal : undefined,
    is_wholesale_price: !!wIn,
  }
}
