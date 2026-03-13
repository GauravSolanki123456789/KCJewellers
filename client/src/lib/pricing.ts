/**
 * Unified Product/Item type used across the entire application.
 * This type represents a jewelry product with all its attributes.
 * 
 * IMPORTANT: All product-related types should extend or use this type
 * to ensure consistency across the codebase.
 */
export type Item = {
  // Identifiers
  id?: string | number
  barcode?: string
  sku?: string
  
  // Display names (use item_name as primary, short_name as fallback)
  item_name?: string
  short_name?: string
  
  // Categorization
  style_code?: string
  
  // Physical properties
  metal_type?: string
  net_wt?: number
  net_weight?: number  // Alternative naming convention
  weight?: number
  purity?: number | string
  
  // Pricing & charges
  mc_type?: string
  mc_rate?: number
  mc_value?: number
  stone_charges?: number
  gst_rate?: number
  
  // Additional fields (for compatibility with API responses)
  image_url?: string
  pcs?: number
  [key: string]: unknown  // Allow additional fields from API
}

type RateRow = { metal_type?: string, display_rate?: number, sell_rate?: number }

/**
 * Picks the live rate for the given metal and converts it to ₹ per gram.
 *
 * The API stores and returns rates as:
 *   - Gold (all karats): ₹ per 10 grams  → divide by 10
 *   - Silver:            ₹ per 1 kg       → divide by 1000
 *   - Platinum:          ₹ per gram        → no conversion needed
 */
function pickRate(live: unknown, metal: string): number {
  const m = (metal || "gold").toLowerCase()
  if (!live) return 0

  let rawRate = 0
  if (Array.isArray(live)) {
    const row = (live as RateRow[]).find((r: RateRow) => (r.metal_type || "").toLowerCase() === m)
    if (!row) return 0
    rawRate = Number(row.display_rate || row.sell_rate || 0)
  } else if (typeof live === "object") {
    const row = (live as Record<string, RateRow>)[m]
    if (!row) return 0
    rawRate = Number(row.display_rate || row.sell_rate || 0)
  }

  // Convert raw stored rate → ₹ per gram
  if (m === 'silver' || m === 'silver_mcx') {
    return rawRate / 1000   // per kg → per gram
  }
  // gold, gold_22k, gold_18k, gold_mcx → per 10g → per gram
  return rawRate / 10
}

function netWeight(item: Item) {
  // net_weight is returned by the API (web_products column); net_wt / weight are legacy fields
  const n = item.net_weight ?? item.net_wt ?? item.weight ?? 0
  return Number(n) || 0
}

function purityPct(item: Item): number {
  const p = Number(item.purity || 0)
  if (!p || p <= 0) return 0
  // Fineness format (e.g. 916 = 91.6%, 750 = 75%) → divide by 10
  if (p >= 100) return p / 10
  // Percentage format (e.g. 91.6) → use directly
  if (p > 1) return p
  // Decimal format (e.g. 0.916) → multiply by 100
  return p * 100
}

function mcAmount(item: Item) {
  const type = (item.mc_type || "PER_GRAM").toUpperCase()
  const val = Number(item.mc_rate ?? item.mc_value ?? 0) || 0
  const wt = netWeight(item)
  return type === "FIXED" ? val : wt * val
}

function stone(item: Item) {
  return Number(item.stone_charges || 0) || 0
}

export function calculateBreakdown(item: Item, liveRates: unknown, gstRate?: number) {
  const ratePerGram = pickRate(liveRates, item.metal_type || "gold")
  const wt = netWeight(item)
  const mcRate = Number(item.mc_rate ?? 0) || 0
  const metalType = (item.metal_type || "gold").toLowerCase()

  // Web products (ERP sync): formula = (ratePerGram * purity) + mc_rate) * net_weight + 3% GST
  const hasMcRate = (item as Record<string, unknown>).mc_rate != null
  if (hasMcRate && (ratePerGram > 0 || mcRate > 0) && wt > 0) {
    // Silver is traded at full purity (treat as 100%); all other metals apply purity factor
    const isSilver = metalType === 'silver' || metalType === 'silver_mcx'
    const purityFactor = isSilver ? 1.0 : (purityPct(item) > 0 ? purityPct(item) / 100 : 1.0)

    // PerGramCost = (liveRate * purityFactor) + mc_rate
    const metalPerGram = ratePerGram * purityFactor
    const perGramCost = metalPerGram + mcRate

    // FinalPrice = perGramCost * net_weight * (1 + GST%)
    const base = perGramCost * wt
    const gstPct = Number(gstRate ?? item.gst_rate ?? 3) || 3
    const gstAmt = base * (gstPct / 100)
    const total = base + gstAmt

    const metalAmt = metalPerGram * wt
    const mcAmt = mcRate * wt

    return { metal: metalAmt, mc: mcAmt, stone: 0, cgst: gstAmt, sgst: 0, taxable: base, total }
  }

  // Legacy path: supports mc_type (PER_GRAM / FIXED), stone_charges, split CGST+SGST
  const purity = purityPct(item)
  const isSilverLegacy = metalType === 'silver' || metalType === 'silver_mcx'
  const purityFactor = isSilverLegacy ? 1.0 : (purity > 0 ? purity / 100 : 1.0)

  const metalAmt = wt * ratePerGram * purityFactor
  const mc = mcAmount(item)
  const stoneAmt = stone(item)
  const taxable = metalAmt + mc + stoneAmt
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const cgst = gst ? taxable * (gst / 200) : 0
  const sgst = gst ? taxable * (gst / 200) : 0
  const total = taxable + cgst + sgst
  return { metal: metalAmt, mc, stone: stoneAmt, cgst, sgst, taxable, total }
}
