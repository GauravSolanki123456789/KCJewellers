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

/** B2B wholesale discount tier: % off making component + % on metal component (can be negative). */
export type DiscountTier = {
  mc_discount_percent: number
  metal_markup_percent: number
}

type RateRow = { metal_type?: string; display_rate?: number; sell_rate?: number }

type BreakdownBase = {
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
  /** True when B2B tier produced a lower total than standard retail. */
  isWholesaleRate?: boolean
}

/**
 * Return the LIVE 1-GRAM rate for a given metal.
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

function applyTierToParts(
  metalPart: number,
  mcPart: number,
  tier: DiscountTier | null | undefined,
): { metal: number; mc: number } {
  if (!tier) return { metal: metalPart, mc: mcPart }
  const mcD = Number(tier.mc_discount_percent) || 0
  const mM = Number(tier.metal_markup_percent) || 0
  return {
    metal: metalPart * (1 + mM / 100),
    mc: mcPart * (1 - mcD / 100),
  }
}

function gstParts(taxable: number, gstPct: number) {
  const gstAmt = taxable * (gstPct / 100)
  return { cgst: gstAmt / 2, sgst: gstAmt / 2, gstAmt }
}

/**
 * FORMULA (web / ERP-synced products):
 *   PerGramCost  = Live1gRate × (purity / 100)
 *   Base         = (PerGramCost + mc_rate) × net_weight
 *   FinalPrice   = Base × (1 + GST%)          — GST default 3 %
 *
 * Optional `discountTier` (B2B): adjusts metal vs making line amounts before GST.
 */
export function calculateBreakdown(
  item: Item,
  liveRates: unknown,
  gstRate?: number,
  discountTier?: DiscountTier | null,
): BreakdownBase {
  const metal = (item.metal_type || 'silver').toLowerCase()

  if (metal.startsWith('diamond')) {
    const fixedPrice = Number(item.fixed_price ?? 0) || 0
    const mcRate = Number(item.mc_rate ?? 0) || 0
    const stoneAmt = Number(item.stone_charges ?? 0) || 0
    const basePrice = fixedPrice > 0 ? fixedPrice : mcRate + stoneAmt
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
    const taxableRetail = discountPct > 0 ? basePrice * (1 - discountPct / 100) : basePrice
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3

    const mcD = Number(discountTier?.mc_discount_percent) || 0
    const mM = Number(discountTier?.metal_markup_percent) || 0
    const hasTier = !!(discountTier && (mcD !== 0 || mM !== 0))
    const taxableWholesale = hasTier
      ? taxableRetail * (1 + mM / 100) * (1 - mcD / 100)
      : taxableRetail

    const pick = (taxable: number) => {
      const { cgst, sgst } = gstParts(taxable, gstPct)
      const total = taxable + (taxable * gstPct) / 100
      return { cgst, sgst, taxable, total }
    }

    const retail = pick(taxableRetail)
    const wholesale = pick(taxableWholesale)
    const originalTotal =
      discountPct > 0
        ? basePrice + (basePrice * gstPct) / 100
        : hasTier && Math.abs(wholesale.total - retail.total) > 0.01
          ? retail.total
          : undefined

    return {
      metal: 0,
      mc: 0,
      stone: 0,
      cgst: wholesale.cgst,
      sgst: wholesale.sgst,
      taxable: wholesale.taxable,
      total: wholesale.total,
      originalTotal: hasTier && Math.abs(wholesale.total - retail.total) > 0.01 ? retail.total : originalTotal,
      discountPercent: discountPct > 0 ? discountPct : undefined,
      isWholesaleRate: hasTier && Math.abs(wholesale.total - retail.total) > 0.01,
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
    const retailMetal = adjustedRate * wt
    const retailMc = mcRate * wt
    const { metal: wMetal, mc: wMc } = applyTierToParts(retailMetal, retailMc, discountTier)
    const hasTier = !!(discountTier && (Number(discountTier.mc_discount_percent) || Number(discountTier.metal_markup_percent)))

    const baseRetail = retailMetal + retailMc
    const baseWholesale = wMetal + wMc
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0

    const finish = (base: number) => {
      const totalBeforeDiscount = base * (1 + gstPct / 100)
      const total =
        discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
      const gstAmt = totalBeforeDiscount - base
      return {
        total,
        totalBeforeDiscount,
        cgst: gstAmt / 2,
        sgst: gstAmt / 2,
        taxable: base,
      }
    }

    const retail = finish(baseRetail)
    const wholesale = finish(baseWholesale)
    const useWholesale = hasTier && Math.abs(wholesale.total - retail.total) > 0.01

    return {
      metal: wMetal,
      mc: wMc,
      stone: 0,
      cgst: useWholesale ? wholesale.cgst : retail.cgst,
      sgst: useWholesale ? wholesale.sgst : retail.sgst,
      taxable: useWholesale ? wholesale.taxable : retail.taxable,
      total: useWholesale ? wholesale.total : retail.total,
      originalTotal: useWholesale
        ? retail.total
        : discountPct > 0
          ? retail.totalBeforeDiscount
          : undefined,
      discountPercent: discountPct > 0 ? discountPct : undefined,
      rate_per_gram: adjustedRate,
      net_weight: wt,
      isWholesaleRate: useWholesale,
    }
  }

  const metalVal = wt * rate * (purity / 100)
  const mc = mcAmount(item)
  const stoneAmt = stone(item)
  const { metal: mW, mc: mcW } = applyTierToParts(metalVal, mc, discountTier)
  const hasTier = !!(discountTier && (Number(discountTier.mc_discount_percent) || Number(discountTier.metal_markup_percent)))

  const baseRetail = metalVal + mc + stoneAmt
  const baseWholesale = mW + mcW + stoneAmt
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const discountPct = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0

  const finishLegacy = (taxable: number) => {
    const cgst = gst ? taxable * (gst / 200) : 0
    const sgst = gst ? taxable * (gst / 200) : 0
    const totalBeforeDiscount = taxable + cgst + sgst
    const total =
      discountPct > 0 ? totalBeforeDiscount * (1 - discountPct / 100) : totalBeforeDiscount
    return { cgst, sgst, taxable, total, totalBeforeDiscount }
  }

  const retail = finishLegacy(baseRetail)
  const wholesale = finishLegacy(baseWholesale)
  const useWholesale = hasTier && Math.abs(wholesale.total - retail.total) > 0.01

  return {
    metal: useWholesale ? mW : metalVal,
    mc: useWholesale ? mcW : mc,
    stone: stoneAmt,
    cgst: useWholesale ? wholesale.cgst : retail.cgst,
    sgst: useWholesale ? wholesale.sgst : retail.sgst,
    taxable: useWholesale ? wholesale.taxable : retail.taxable,
    total: useWholesale ? wholesale.total : retail.total,
    originalTotal: useWholesale
      ? retail.total
      : discountPct > 0
        ? retail.totalBeforeDiscount
        : undefined,
    discountPercent: discountPct > 0 ? discountPct : undefined,
    rate_per_gram: wt > 0 ? rate * (purity / 100) : 0,
    net_weight: wt,
    isWholesaleRate: useWholesale,
  }
}
