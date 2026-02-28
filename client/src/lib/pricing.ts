export type Item = {
  metal_type?: string
  net_wt?: number
  weight?: number
  purity?: number
  mc_type?: string
  mc_rate?: number
  mc_value?: number
  stone_charges?: number
  gst_rate?: number
}

type RateRow = { metal_type?: string, display_rate?: number, sell_rate?: number }
function pickRate(live: unknown, metal: string) {
  const m = (metal || "gold").toLowerCase()
  if (!live) return 0
  if (Array.isArray(live)) {
    const row = (live as RateRow[]).find((r: RateRow) => (r.metal_type || "").toLowerCase() === m)
    if (!row) return 0
    return Number(row.display_rate || row.sell_rate || 0)
  }
  if (typeof live === "object") {
    const row = (live as Record<string, RateRow>)[m]
    if (!row) return 0
    return Number(row.display_rate || row.sell_rate || 0)
  }
  return 0
}

function netWeight(item: Item) {
  const n = item.net_wt ?? item.weight ?? 0
  return Number(n) || 0
}

function purityPct(item: Item) {
  const p = Number(item.purity || 0)
  if (!p || p <= 0) return 0
  return p > 1 && p <= 100 ? p : p * 100
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
  const rate = pickRate(liveRates, item.metal_type || "gold")
  const wt = netWeight(item)
  const purity = purityPct(item)
  const metal = wt * rate * (purity / 100)
  const mc = mcAmount(item)
  const stoneAmt = stone(item)
  const taxable = metal + mc + stoneAmt
  const gst = Number(gstRate ?? item.gst_rate ?? 0) || 0
  const cgst = gst ? taxable * (gst / 200) : 0
  const sgst = gst ? taxable * (gst / 200) : 0
  const total = taxable + cgst + sgst
  return { metal, mc, stone: stoneAmt, cgst, sgst, taxable, total }
}
