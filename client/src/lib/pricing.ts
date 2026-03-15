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

type RateRow = { metal_type?: string; display_rate?: number; sell_rate?: number }

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
  const n = item.net_weight ?? item.net_wt ?? item.weight ?? 0
  return Number(n) || 0
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

/**
 * FORMULA (web / ERP-synced products):
 *   PerGramCost  = Live1gRate × (purity / 100)
 *                  (silver with purity ≈ 92.5 → treat purity as 100)
 *   Base         = (PerGramCost + mc_rate) × net_weight
 *   FinalPrice   = Base × (1 + GST%)          — GST default 3 %
 *
 * DIAMOND: metal_type 'diamond' or 'diamonds' → use fixed_price only, ignore live rates.
 * Legacy (non-web) products fall through to the classic formula.
 */
export function calculateBreakdown(item: Item, liveRates: unknown, gstRate?: number) {
  const metal = (item.metal_type || 'silver').toLowerCase()

  // Diamond products: bypass live rate/weight. Use fixed_price if set, else mc_rate + stone_charges
  // (Admin can type final fixed price into MC field in ERP)
  if (metal.startsWith('diamond')) {
    const fixedPrice = Number(item.fixed_price ?? 0) || 0
    const mcRate = Number(item.mc_rate ?? 0) || 0
    const stoneAmt = Number(item.stone_charges ?? 0) || 0
    const basePrice = fixedPrice > 0 ? fixedPrice : mcRate + stoneAmt
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
    const total = discountPct > 0 ? basePrice * (1 - discountPct / 100) : basePrice
    const originalTotal = discountPct > 0 ? basePrice : undefined
    return {
      metal: 0,
      mc: fixedPrice > 0 ? 0 : mcRate,
      stone: fixedPrice > 0 ? 0 : stoneAmt,
      cgst: 0,
      sgst: 0,
      taxable: basePrice,
      total,
      originalTotal,
      discountPercent: discountPct > 0 ? discountPct : undefined,
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
    const perGramCost = adjustedRate + mcRate
    const base = perGramCost * wt
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const totalBeforeDiscount = base * (1 + gstPct / 100)
    const gstAmt = totalBeforeDiscount - base
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
    const total = discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
    return {
      metal: adjustedRate * wt,
      mc: mcRate * wt,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: base,
      total,
      originalTotal: discountPct > 0 ? totalBeforeDiscount : undefined,
      discountPercent: discountPct > 0 ? discountPct : undefined,
    }
  }

  // Legacy path (non-web products without mc_rate on the row)
  const metalVal = wt * rate * (purity / 100)
  const mc = mcAmount(item)
  const stoneAmt = stone(item)
  const taxable = metalVal + mc + stoneAmt
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const cgst = gst ? taxable * (gst / 200) : 0
  const sgst = gst ? taxable * (gst / 200) : 0
  const totalBeforeDiscount = taxable + cgst + sgst
  const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
  const total = discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
  return {
    metal: metalVal,
    mc,
    stone: stoneAmt,
    cgst,
    sgst,
    taxable,
    total,
    originalTotal: discountPct > 0 ? totalBeforeDiscount : undefined,
    discountPercent: discountPct > 0 ? discountPct : undefined,
  }
}
