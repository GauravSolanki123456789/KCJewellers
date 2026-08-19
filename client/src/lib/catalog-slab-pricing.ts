/**
 * Shared catalogue pricing slabs — SLABR (retail), SLABW (wholesale MC), SLABF (wholesale + wastage).
 * Admin configures per-reseller defaults in `users.reseller_slab_settings`; each link snapshots them.
 */
import {
  calculateBreakdown,
  goldStorefrontTotal,
  isFixedPriceCatalogItem,
  isGiftingItem,
  isMcPerPiece,
  metalBillableWeight,
  netWeight,
  purityPct,
  resolveItemGstRate,
  resolveProductWastagePercent,
  silverEffectivePurityPct,
  snapWastagePercent,
  type CatalogPricingOptions,
  type Item,
  type PriceBreakdown,
  type WholesalePricingInput,
} from '@/lib/pricing'

export type CatalogSlabKind = 'standard' | 'slab_r' | 'slab_w' | 'slab_f'

export type ResellerSlabTierSettings = {
  /** MC/PC — % off making charges when mc_type is per-piece. */
  mc_discount_pct?: number
  /** MC/GM — % off making charges when mc_type is per-gram (silver etc.). */
  mc_gm_discount_pct?: number
  /** SLABR — subtract from live 999 silver ₹/g (e.g. 5 → rate 240 when live is 245). */
  silver_rate_offset_per_g?: number
  /** SLABR gold — subtract from live gold ₹/g for gold jewellery. */
  gold_rate_offset_per_g?: number
  /** SLABF — reduce wastage percentage points (e.g. 10% wastage − 2 → 8%). */
  wastage_discount_pct?: number
  /** Gift / fixed-price items — % off final MRP (no MC/wastage). */
  gift_discount_pct?: number
  /** Markup % added to the final price (after discounts). Used when discounts are 0. */
  margin_pct?: number
}

export type ResellerSlabSettings = {
  slab_r?: ResellerSlabTierSettings
  slab_w?: ResellerSlabTierSettings
  slab_f?: ResellerSlabTierSettings
  /** Separate slab defaults for gold metal type (ERP billing + shared catalog). */
  gold_slab_r?: ResellerSlabTierSettings
  gold_slab_w?: ResellerSlabTierSettings
  gold_slab_f?: ResellerSlabTierSettings
}

export type SharedCatalogSlabContext = {
  kind: CatalogSlabKind
  settings: ResellerSlabTierSettings
  /** When set, tier settings are resolved per item metal (gold vs silver/gift). */
  allSettings?: ResellerSlabSettings | null
  /** User-entered wholesale ₹/g (SLABW / SLABF) — fine metal rate before purity factor. */
  wholesaleGoldRatePerG?: number | null
  wholesaleSilverRatePerG?: number | null
  /** Slab R gold: bundle wastage into MC (true, default). False = wastage % in metal like Slab W/F. */
  goldSlabRUseMcPricing?: boolean
}

function clampPct(n: unknown, lo = 0, hi = 100): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(lo, Math.min(hi, v))
}

export function clampMarginPct(n: unknown): number {
  return clampPct(n, 0, 1000)
}

/** Increase final price by margin % (storefront + shared catalogue slabs). */
export function applySlabMarginToBreakdown<T extends { total: number; taxable?: number; cgst?: number; sgst?: number; originalTotal?: number | null }>(
  b: T,
  marginPct: unknown,
): T {
  const m = clampMarginPct(marginPct)
  if (m <= 0) return b
  const factor = 1 + m / 100
  const total = Math.round(b.total * factor)
  const taxable =
    b.taxable != null && Number.isFinite(b.taxable)
      ? Math.round(b.taxable * factor)
      : b.taxable
  const gstAmt = taxable != null ? total - taxable : undefined
  return {
    ...b,
    total,
    taxable,
    cgst: gstAmt != null ? gstAmt / 2 : b.cgst,
    sgst: gstAmt != null ? gstAmt / 2 : b.sgst,
    originalTotal:
      b.originalTotal != null && Number.isFinite(b.originalTotal)
        ? Math.round(b.originalTotal * factor)
        : b.originalTotal,
  }
}

export function applyMarginPctToTotal(total: number, marginPct: unknown): number {
  const m = clampMarginPct(marginPct)
  if (m <= 0) return total
  return Math.round(total * (1 + m / 100))
}

export function parseResellerSlabSettings(raw: unknown): ResellerSlabSettings {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const tier = (key: string): ResellerSlabTierSettings | undefined => {
    const t = o[key]
    if (!t || typeof t !== 'object') return undefined
    const row = t as Record<string, unknown>
    return {
      mc_discount_pct: clampPct(row.mc_discount_pct, 0, 100),
      mc_gm_discount_pct: clampPct(row.mc_gm_discount_pct, 0, 100),
      silver_rate_offset_per_g: Math.max(0, Number(row.silver_rate_offset_per_g) || 0),
      gold_rate_offset_per_g: Math.max(0, Number(row.gold_rate_offset_per_g) || 0),
      wastage_discount_pct: clampPct(row.wastage_discount_pct, 0, 100),
      gift_discount_pct: clampPct(row.gift_discount_pct, 0, 100),
      margin_pct: clampMarginPct(row.margin_pct),
    }
  }
  return {
    slab_r: tier('slab_r'),
    slab_w: tier('slab_w'),
    slab_f: tier('slab_f'),
    gold_slab_r: tier('gold_slab_r'),
    gold_slab_w: tier('gold_slab_w'),
    gold_slab_f: tier('gold_slab_f'),
  }
}

function isGoldMetalType(metalType: string | null | undefined): boolean {
  return String(metalType || '').toLowerCase().startsWith('gold')
}

export function tierSettingsForSlab(
  settings: ResellerSlabSettings,
  kind: CatalogSlabKind,
  metalType?: string | null,
): ResellerSlabTierSettings {
  const gold = isGoldMetalType(metalType)
  if (kind === 'slab_r') return (gold ? settings.gold_slab_r : settings.slab_r) ?? {}
  if (kind === 'slab_w') return (gold ? settings.gold_slab_w : settings.slab_w) ?? {}
  if (kind === 'slab_f') return (gold ? settings.gold_slab_f : settings.slab_f) ?? {}
  return {}
}

function rateRow(live: unknown, metalType: string): { display_rate?: number; sell_rate?: number } | null {
  const key = (metalType || '').toLowerCase()
  if (!live) return null
  if (Array.isArray(live)) {
    return (
      (live as { metal_type?: string; display_rate?: number; sell_rate?: number }[]).find(
        (r) => (r.metal_type || '').toLowerCase() === key,
      ) ?? null
    )
  }
  if (typeof live === 'object' && live !== null) {
    return (live as Record<string, { display_rate?: number; sell_rate?: number }>)[key] ?? null
  }
  return null
}

function liveSilver999PerGram(rates: unknown): number {
  const row = rateRow(rates, 'silver')
  if (!row) return 0
  return Number(row.display_rate ?? row.sell_rate ?? 0) / 1000
}

function liveGold24PerGram(rates: unknown): number {
  const row = rateRow(rates, 'gold')
  if (!row) return 0
  return Number(row.display_rate ?? row.sell_rate ?? 0) / 10
}

function goldRateForItem(live: unknown, item: Item): number {
  const g24 = liveGold24PerGram(live)
  const g22Row = rateRow(live, 'gold_22k')
  const g18Row = rateRow(live, 'gold_18k')
  const g22 =
    g22Row && Number(g22Row.display_rate ?? g22Row.sell_rate)
      ? Number(g22Row.display_rate ?? g22Row.sell_rate) / 10
      : g24 > 0
        ? g24 * 0.916
        : 0
  const g18 =
    g18Row && Number(g18Row.display_rate ?? g18Row.sell_rate)
      ? Number(g18Row.display_rate ?? g18Row.sell_rate) / 10
      : g24 > 0
        ? g24 * 0.75
        : 0
  const p = purityPct(item)
  if (p >= 99 || p >= 99.5) return g24
  if ((p >= 90 && p <= 93) || Math.abs(p - 91.6) < 1.5) return g22
  if ((p >= 74 && p <= 76) || Math.abs(p - 75) < 1.5) return g18
  if (g24 > 0 && p > 0) return g24 * (p / 100)
  return g24 || g22 || g18
}

function silverEffectivePurity(purity: number): number {
  return silverEffectivePurityPct(purity)
}

/** Customer-facing lines explaining slab savings on a line item. */
export function formatSlabDiscountLines(
  slab: SharedCatalogSlabContext | null | undefined,
  item: Item,
): string[] {
  if (!slab || slab.kind === 'standard') return []
  const s = slab.allSettings
    ? tierSettingsForSlab(slab.allSettings, slab.kind, item.metal_type)
    : (slab.settings ?? {})
  const lines: string[] = []
  const mc = resolveMcDiscountPct(item, s)
  const wastageDisc = clampPct(s.wastage_discount_pct, 0, 100)
  const giftDisc = clampPct(s.gift_discount_pct, 0, 100)

  if (isFixedPriceCatalogItem(item)) {
    if (giftDisc > 0) lines.push(`Gift / MRP ${Math.round(giftDisc)}% off`)
    return lines
  }

  if (mc > 0) {
    lines.push(
      isMcPerPiece(item.mc_type)
        ? `MC/PC ${Math.round(mc)}% off`
        : `MC/GM ${Math.round(mc)}% off`,
    )
  }
  const metal = String(item.metal_type || '').toLowerCase()
  const isGold = metal.startsWith('gold')
  if (wastageDisc > 0 && isGold && !isFixedPriceCatalogItem(item)) {
    const w = resolveProductWastagePercent(item)
    if (w > 0) {
      const after = snapWastagePercent(Math.max(0, w - wastageDisc))
      if (slab.kind === 'slab_r') {
        lines.push(`Wastage ${Math.round(w)}% → MC (−${Math.round(wastageDisc)} pts on wastage)`)
      } else {
        lines.push(`Wastage ${Math.round(w)}% → ${after}% (−${Math.round(wastageDisc)} pts)`)
      }
    }
  } else if (slab.kind === 'slab_f' && wastageDisc > 0 && !isGold) {
    const w = resolveProductWastagePercent(item)
    if (w > 0) {
      const after = snapWastagePercent(Math.max(0, w - wastageDisc))
      lines.push(`Wastage ${Math.round(w)}% → ${after}% (−${Math.round(wastageDisc)} pts)`)
    }
  }
  if (slab.kind === 'slab_r') {
    const silverOffset = Math.max(0, Number(s.silver_rate_offset_per_g) || 0)
    const goldOffset = Math.max(0, Number(s.gold_rate_offset_per_g) || 0)
    if (silverOffset > 0 && metal.startsWith('silver')) {
      lines.push(`Silver rate −₹${silverOffset}/g vs today`)
    }
    if (goldOffset > 0 && metal.startsWith('gold')) {
      lines.push(`Gold rate −₹${goldOffset}/g vs today`)
    }
  }
  if (slab.kind === 'slab_w' || slab.kind === 'slab_f') {
    if (metal.startsWith('silver')) {
      const wr = Number(slab.wholesaleSilverRatePerG)
      if (Number.isFinite(wr) && wr > 0) lines.push(`Wholesale silver ₹${wr}/g`)
    } else if (metal.startsWith('gold')) {
      const wr = Number(slab.wholesaleGoldRatePerG)
      if (Number.isFinite(wr) && wr > 0) lines.push(`Wholesale gold ₹${wr}/g`)
    }
  }
  if (giftDisc > 0 && isFixedPriceCatalogItem(item)) {
    lines.push(`Gift / MRP ${Math.round(giftDisc)}% off`)
  }
  return lines
}

function resolveMcDiscountPct(item: Item, settings: ResellerSlabTierSettings): number {
  if (isMcPerPiece(item.mc_type)) {
    return clampPct(settings.mc_discount_pct, 0, 100)
  }
  const gm = settings.mc_gm_discount_pct
  if (gm != null && Number.isFinite(Number(gm))) {
    return clampPct(gm, 0, 100)
  }
  return clampPct(settings.mc_discount_pct, 0, 100)
}

function mcPart(item: Item, mcDiscountPct: number): number {
  const val = Number(item.mc_rate ?? item.mc_value ?? 0) || 0
  const wt = netWeight(item)
  const raw = isMcPerPiece(item.mc_type) ? val : wt * val
  const disc = clampPct(mcDiscountPct, 0, 100)
  return raw * (1 - disc / 100)
}

function stonePart(item: Item): number {
  return Number(item.stone_charges || 0) || 0
}

/** Reduce configured wastage points before metal / MC-as-wastage calculations. */
function effectiveGoldWastagePct(item: Item, wastageDiscountPts: number): number {
  let w = resolveProductWastagePercent(item)
  if (w > 0 && wastageDiscountPts > 0) {
    w = snapWastagePercent(Math.max(0, w - clampPct(wastageDiscountPts, 0, 100)))
  }
  return w
}

function billableWithSlabWastage(item: Item, wastageDiscountPct: number): number {
  const net = netWeight(item)
  if (net <= 0) return net
  let w = resolveProductWastagePercent(item)
  if (w > 0 && wastageDiscountPct > 0) {
    w = snapWastagePercent(Math.max(0, w - clampPct(wastageDiscountPct, 0, 100)))
  }
  if (w > 0) return net * (1 + w / 100)
  const gross = Number(item.gross_weight ?? 0) || 0
  if (gross > net) return gross
  return net
}

function resolveFineMetalRatePerG(
  item: Item,
  rates: unknown,
  slab: SharedCatalogSlabContext,
): number {
  const metal = String(item.metal_type || 'silver').toLowerCase()
  const isSilver = metal.startsWith('silver')

  if (slab.kind === 'slab_r' && isSilver) {
    const live = liveSilver999PerGram(rates)
    const offset = Math.max(0, Number(slab.settings.silver_rate_offset_per_g) || 0)
    return Math.max(0, live - offset)
  }

  if (slab.kind === 'slab_r' && metal.startsWith('gold')) {
    const live = goldRateForItem(rates, item)
    const offset = Math.max(0, Number(slab.settings.gold_rate_offset_per_g) || 0)
    return Math.max(0, live - offset)
  }

  if (slab.kind === 'slab_w' || slab.kind === 'slab_f') {
    if (isSilver) {
      const wr = Number(slab.wholesaleSilverRatePerG)
      if (Number.isFinite(wr) && wr > 0) return wr
    } else if (metal.startsWith('gold')) {
      const wr = Number(slab.wholesaleGoldRatePerG)
      if (Number.isFinite(wr) && wr > 0) return wr
    }
  }

  if (isSilver) return liveSilver999PerGram(rates)
  return goldRateForItem(rates, item)
}

/** Recompute breakdown with slab rules (MC-only discount, optional rate / wastage overrides). */
export function calculateBreakdownWithSlab(
  item: Item,
  rates: unknown,
  gstRate: number | undefined,
  slab: SharedCatalogSlabContext | null | undefined,
  wholesale?: WholesalePricingInput | null,
  pricingOptions?: CatalogPricingOptions,
): PriceBreakdown {
  const gst = resolveItemGstRate(item, gstRate, pricingOptions)
  const kind = slab?.kind ?? 'standard'

  if (!slab || kind === 'standard') {
    return calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
  }

  const settings = slab.allSettings
    ? tierSettingsForSlab(slab.allSettings, kind, item.metal_type)
    : (slab.settings ?? {})
  const effectiveSlab: SharedCatalogSlabContext = { ...slab, settings }
  const mcDisc = resolveMcDiscountPct(item, settings)
  const giftDisc = clampPct(settings.gift_discount_pct, 0, 100)
  const finish = (b: PriceBreakdown) => applySlabMarginToBreakdown(b, settings.margin_pct)

  if (isFixedPriceCatalogItem(item)) {
    const base = calculateBreakdown(item, rates, gst, null, pricingOptions)
    if (giftDisc <= 0) return finish(base)
    const total = Math.round(base.total * (1 - giftDisc / 100))
    return finish({
      ...base,
      total,
      originalTotal: base.total,
      discountPercent: giftDisc,
    })
  }

  const metal = String(item.metal_type || 'silver').toLowerCase()
  const isSilver = metal.startsWith('silver')
  const isGold = !isSilver && !metal.startsWith('diamond') && !isGiftingItem(item)
  if (!isGold && !isSilver) {
    return calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
  }

  const netWt = netWeight(item)
  const purity = purityPct(item)
  const wastageDiscPts = clampPct(settings.wastage_discount_pct, 0, 100)
  const wastageDiscForBillWt = kind === 'slab_f' ? wastageDiscPts : 0
  const billWt =
    kind === 'slab_f' && wastageDiscForBillWt > 0
      ? billableWithSlabWastage(item, wastageDiscForBillWt)
      : metalBillableWeight(item)

  const fineRate = resolveFineMetalRatePerG(item, rates, effectiveSlab)
  if (fineRate <= 0 || netWt <= 0 || billWt <= 0) {
    return calculateBreakdown(item, rates, gst, wholesale ?? undefined, pricingOptions)
  }

  const effPurity = isSilver ? silverEffectivePurity(purity) : 100
  const metalRate = isGold ? fineRate : fineRate * (effPurity / 100)

  let metalPart: number
  let mc: number
  let wastagePctVal = 0
  let wastageAmount: number | undefined
  let mcBeforeDiscount: number | undefined

  if (isGold && kind === 'slab_r' && slab.goldSlabRUseMcPricing !== false) {
    const effectiveWastage = effectiveGoldWastagePct(item, wastageDiscPts)
    metalPart = Math.floor(netWt * metalRate)
    const wastageAsMc = Math.floor((netWt * metalRate * effectiveWastage) / 100)
    const itemMcRaw = Math.round(mcPart(item, 0))
    mcBeforeDiscount = wastageAsMc + itemMcRaw
    mc =
      mcDisc > 0
        ? Math.round(mcBeforeDiscount * (1 - mcDisc / 100))
        : mcBeforeDiscount
  } else if (isGold) {
    wastagePctVal = effectiveGoldWastagePct(
      item,
      kind === 'slab_w' || kind === 'slab_f' ? wastageDiscPts : 0,
    )
    metalPart = Math.floor((netWt * metalRate * (100 + wastagePctVal)) / 100)
    const mcRaw = Math.round(mcPart(item, 0))
    mc = mcDisc > 0 ? Math.round(mcRaw * (1 - mcDisc / 100)) : mcRaw
    if (mcDisc > 0 && mcRaw > mc) mcBeforeDiscount = mcRaw
    wastageAmount = Math.max(0, metalPart - Math.floor(netWt * metalRate))
  } else {
    metalPart = metalRate * billWt
    const mcRaw = mcPart(item, 0)
    mc = mcPart(item, mcDisc)
    if (mcDisc > 0 && mcRaw > mc) mcBeforeDiscount = Math.round(mcRaw)
  }

  const stone = isGold ? Math.round(stonePart(item)) : stonePart(item)
  const baseRetail = metalPart + mc + stone
  const gstPct = gst

  const categoryDisc = Number((item as { discount_percentage?: number }).discount_percentage || 0) || 0
  if (categoryDisc > 0) {
    const totalBeforeDiscount = isGold
      ? goldStorefrontTotal(baseRetail, gstPct)
      : baseRetail * (1 + gstPct / 100)
    const total = totalBeforeDiscount * (1 - categoryDisc / 100)
    const gstAmt = totalBeforeDiscount - baseRetail
    return finish({
      metal: metalPart,
      mc,
      stone,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable: baseRetail,
      total,
      originalTotal: totalBeforeDiscount,
      discountPercent: categoryDisc,
      rate_per_gram: metalRate,
      net_weight: netWt,
      billable_weight_gm: billWt,
      wastage_pct: isGold && wastagePctVal > 0 ? wastagePctVal : undefined,
      wastage_amount: wastageAmount,
    })
  }

  const totalBeforeDiscount = isGold
    ? goldStorefrontTotal(baseRetail, gstPct)
    : Math.round(baseRetail * (1 + gstPct / 100))
  const gstAmt = totalBeforeDiscount - baseRetail

  return finish({
    metal: metalPart,
    mc,
    stone,
    cgst: gstAmt / 2,
    sgst: gstAmt / 2,
    taxable: baseRetail,
    total: totalBeforeDiscount,
    rate_per_gram: metalRate,
    net_weight: netWt,
    billable_weight_gm: billWt,
    wastage_pct: isGold && wastagePctVal > 0 ? wastagePctVal : undefined,
    wastage_amount: wastageAmount,
    mc_before_discount:
      mcBeforeDiscount != null && mcBeforeDiscount > mc ? mcBeforeDiscount : undefined,
    mc_discount_pct:
      mcBeforeDiscount != null && mcBeforeDiscount > mc && mcDisc > 0 ? mcDisc : undefined,
  })
}

export function slabLabel(kind: CatalogSlabKind): string {
  switch (kind) {
    case 'slab_r':
      return 'Slab R (Retail)'
    case 'slab_w':
      return 'Slab W (Wholesale)'
    case 'slab_f':
      return 'Slab F (Wholesale + wastage)'
    default:
      return 'Standard'
  }
}

/** Infer which wholesale metal rates the selection needs. */
export function metalsNeedingWholesaleRate(items: Item[]): {
  needsGold: boolean
  needsSilver: boolean
} {
  let needsGold = false
  let needsSilver = false
  for (const item of items) {
    if (isFixedPriceCatalogItem(item)) continue
    const mt = String(item.metal_type || '').toLowerCase()
    if (mt.startsWith('gold')) needsGold = true
    if (mt.startsWith('silver')) needsSilver = true
  }
  return { needsGold, needsSilver }
}
