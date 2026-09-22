import {
  calculateBreakdownWithSlab,
  parseResellerSlabSettings,
  tierSettingsForSlab,
  type CatalogSlabKind,
  type ResellerSlabSettings,
  type SharedCatalogSlabContext,
} from '@/lib/catalog-slab-pricing'
import {
  applyPieceSlabToLine,
  computeErpPieceSlabBreakdown,
  lineHasPieceSlabFields,
  pieceSlabBillableWeight,
  resolveErpSilverMetalRatePerG,
  pieceSlabMcRate,
} from '@/lib/erp-piece-slab-pricing'
import { applyGiftMrpPieceRate } from '@/lib/erp-gift-mrp-pricing'
import {
  isFixedPriceCatalogItem,
  isGiftingItem,
  isMcPerPiece,
  type Item,
  type PriceBreakdown,
} from '@/lib/pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type ErpRateSlab = 'R' | 'W' | 'F'

export function erpSlabToKind(slab: ErpRateSlab): CatalogSlabKind {
  if (slab === 'W') return 'slab_w'
  if (slab === 'F') return 'slab_f'
  return 'slab_r'
}

/** Parse rate slab from legacy bill notes (`Rate slab W · address`). */
export function parseRateSlabFromNotes(notes?: string | null): ErpRateSlab | null {
  const m = String(notes || '').match(/Rate slab\s+([RWF])\b/i)
  if (!m) return null
  return m[1].toUpperCase() as ErpRateSlab
}

/** Silver gift catalogue rows (SILVER GIFT ITEMS / GIFT ITEMS) — match storefront slab pricing. */
export function isSilverGiftStockLine(line: ErpBillLine): boolean {
  const sku = String(line.sku || '').toUpperCase()
  const style = String(line.style_code || '').toUpperCase()
  const inv = String(line.invoice_item_name || '').toUpperCase()
  return sku.includes('GIFT') || style.includes('GIFT ITEM') || inv.includes('GIFT ITEM')
}

export function lineToItem(line: ErpBillLine): Item {
  return {
    barcode: line.barcode || line.code,
    sku: line.sku,
    item_name: line.name,
    style_code: line.style_code,
    metal_type: line.metal_type || 'silver',
    net_weight: line.weightGm ?? undefined,
    net_wt: line.weightGm ?? undefined,
    purity: line.purity ?? 925,
    wastage_pct: line.wastage_pct ?? undefined,
    mc_rate: line.mc_rate ?? undefined,
    mc_type: line.mc_type ?? undefined,
    stone_charges: line.stone_charges ?? 0,
    stone_wt: line.stone_wt ?? undefined,
    box_charges: line.box_charges ?? 0,
    fixed_price: line.fixed_price ?? undefined,
    size: line.size ?? undefined,
    pcs: line.qty ?? 1,
  }
}

export function buildSlabContext(
  slab: ErpRateSlab,
  settings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
  metalType?: string | null,
  goldSlabRShowMc = true,
): SharedCatalogSlabContext {
  const kind = erpSlabToKind(slab)
  return {
    kind,
    settings: tierSettingsForSlab(settings, kind, metalType),
    allSettings: settings,
    wholesaleGoldRatePerG: wholesaleGold ?? null,
    wholesaleSilverRatePerG: wholesaleSilver ?? null,
    goldSlabRUseMcPricing: goldSlabRShowMc !== false,
  }
}

export function computeLineTotal(
  line: ErpBillLine,
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
  goldPerG = 0,
  silverPerG = 0,
): number {
  return computeLineBreakdown(
    line,
    displayRates,
    slab,
    slabSettings,
    wholesaleGold,
    wholesaleSilver,
    goldPerG,
    silverPerG,
  ).total
}

type RateRow = { metal_type?: string; display_rate?: number; sell_rate?: number }

/**
 * Apply per-line Rate column override only when the user locked the rate.
 * Auto-shown slab rates (e.g. 245 = 250−5) must NOT feed back into slab math
 * or the silver offset is applied twice.
 */
export function resolveLineDisplayRates(
  line: ErpBillLine,
  displayRates: unknown,
  goldPerG = 0,
  silverPerG = 0,
): unknown {
  const base: RateRow[] =
    Array.isArray(displayRates) && displayRates.length
      ? (displayRates as RateRow[]).map((r) => ({ ...r }))
      : (perGramToDisplayRates(goldPerG, silverPerG) as RateRow[])

  if (!line.rateLocked || line.ratePerGram == null || !Number.isFinite(line.ratePerGram)) {
    return base
  }

  const metal = String(line.metal_type || '').toLowerCase()
  const rate = Number(line.ratePerGram)

  if (metal.startsWith('gold')) {
    const p = Number(line.purity) || 75
    let key = 'gold'
    if ((p >= 74 && p <= 76) || Math.abs(p - 75) < 1.5) key = 'gold_18k'
    else if ((p >= 90 && p <= 93) || Math.abs(p - 91.6) < 1.5) key = 'gold_22k'
    const idx = base.findIndex((r) => (r.metal_type || '').toLowerCase() === key)
    const display_rate = Math.round(rate * 10)
    if (idx >= 0) base[idx] = { ...base[idx], display_rate }
    else base.push({ metal_type: key, display_rate })
    return base
  }

  if (metal.startsWith('silver')) {
    const idx = base.findIndex((r) => (r.metal_type || '').toLowerCase() === 'silver')
    const display_rate = Math.round(rate * 1000)
    if (idx >= 0) base[idx] = { ...base[idx], display_rate }
    else base.push({ metal_type: 'silver', display_rate })
  }

  return base
}

/** Weight-based silver gift stock (catalogue MC + metal, not flat MRP × qty). */
export function isWeightBasedSilverGiftLine(line: ErpBillLine): boolean {
  if (!isSilverGiftStockLine(line)) return false
  const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0)
  if (wt <= 0) return false
  const metal = String(line.metal_type || '').toLowerCase()
  if (isGiftingItem({ metal_type: metal } as Item)) return false
  return metal.startsWith('silver')
}

/** Weight-based silver gift stock billed with MC/GM (combined ₹/g × net wt). */
export function isSilverGiftMcGmLine(line: ErpBillLine): boolean {
  if (!isWeightBasedSilverGiftLine(line)) return false
  return !isMcPerPiece(line.mc_type)
}

function computeSilverGiftMcGmBreakdown(
  line: ErpBillLine,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  silverPerG: number,
  wholesaleSilver?: number | null,
  gstPct = 3,
): PriceBreakdown {
  const netWt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  const qty = Math.max(1, Number(line.qty) || 1)
  const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type)
  const silverOffset =
    slab === 'R' ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0
  const metalRate = resolveErpSilverMetalRatePerG(
    slab,
    silverPerG,
    wholesaleSilver,
    silverOffset,
  )
  const mcBase = Number(line.mc_rate) || 0
  const mcDisc = Math.max(
    0,
    Math.min(
      100,
      Number(tier.mc_gm_discount_pct ?? tier.mc_discount_pct) || 0,
    ),
  )
  const mcPerG = mcDisc > 0 ? mcBase * (1 - mcDisc / 100) : mcBase
  const combinedPerG = metalRate + mcPerG
  const metalPart = Math.round(metalRate * netWt * qty)
  const mc = Math.round(mcPerG * netWt * qty)
  const taxable = metalPart + mc
  const totalWithGst = Math.round(taxable * (1 + gstPct / 100))
  const gstAmt = totalWithGst - taxable
  const box = Number(line.box_charges || 0) || 0
  const total = totalWithGst + box
  return {
    metal: metalPart,
    mc,
    stone: 0,
    cgst: gstAmt / 2,
    sgst: gstAmt / 2,
    taxable,
    total,
    rate_per_gram: metalRate,
    net_weight: netWt,
    billable_weight_gm: netWt,
    mc_before_discount:
      mcDisc > 0 && mcBase > mcPerG ? Math.round(mcBase * netWt * qty) : undefined,
    mc_discount_pct: mcDisc > 0 && mcBase > mcPerG ? mcDisc : undefined,
  }
}

/** Gift / MRP / fixed piece-rate rows (qty × fixed price, no weight-based metal math). */
export function isPiecePricedBillLine(line: ErpBillLine): boolean {
  if (isWeightBasedSilverGiftLine(line)) return false
  const wt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  const mcType = String(line.mc_type || '').toUpperCase()
  if (mcType.includes('FIXED')) {
    const rate = Number(line.fixed_price ?? line.unitInr ?? line.mc_rate ?? 0)
    if (rate > 0 && wt <= 0) return true
  }
  const item = lineToItem(line)
  if (isFixedPriceCatalogItem(item) && Number(item.fixed_price ?? 0) > 0) return true
  if (line.mrpMode) return true
  if (line.manualCategory === 'gift') {
    const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0)
    const metal = String(line.metal_type || '').toLowerCase()
    if (wt > 0 && metal.startsWith('silver') && isSilverGiftStockLine(line)) return false
    const pieceRate = Number(line.unitInr ?? line.fixed_price ?? 0)
    return pieceRate > 0 && wt <= 0
  }
  const pieceRate = Number(line.unitInr ?? line.fixed_price ?? 0)
  return pieceRate > 0 && wt <= 0
}

const ERP_LINE_GST_PCT = 3

/** Extra ₹ added on top of weight-based metal + MC (not MRP-only rows). */
export function erpAdditiveFixedChargeInr(line: ErpBillLine): number {
  if (isPiecePricedBillLine(line)) return 0
  const fixed = Number(line.fixed_price ?? 0) || 0
  if (fixed <= 0) return 0
  const wt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  return wt > 0 ? fixed : 0
}

function appendTaxableExtraToBreakdown(
  bd: PriceBreakdown,
  extra: number,
  gstPct = ERP_LINE_GST_PCT,
): PriceBreakdown {
  if (extra <= 0) return bd
  const taxable = bd.taxable + extra
  const total = Math.round(taxable * (1 + gstPct / 100))
  const gstAmt = total - taxable
  return { ...bd, taxable, total, cgst: gstAmt / 2, sgst: gstAmt / 2 }
}

function finalizeWeightBasedBreakdown(line: ErpBillLine, bd: PriceBreakdown): PriceBreakdown {
  return appendTaxableExtraToBreakdown(bd, erpAdditiveFixedChargeInr(line))
}

export function applyPiecePricedLineCalc(line: ErpBillLine): ErpBillLine {
  const parsed = Number(line.qty)
  const pieceRate =
    Number(line.unitInr ?? line.fixed_price ?? line.ratePerGram ?? line.mc_rate) || 0
  const isGift = line.manualCategory === 'gift' || !!line.mrpMode
  let qty = Number.isFinite(parsed) && parsed > 0 ? parsed : isGift ? 0 : 1
  if (pieceRate > 0 && qty <= 0 && (line.mrpMode || isFixedPriceCatalogItem(lineToItem(line)))) {
    qty = 1
  }
  const box = Number(line.box_charges || 0) || 0
  return {
    ...line,
    qty,
    unitInr: pieceRate > 0 ? pieceRate : line.unitInr,
    lineTotalInr: Math.round((qty * pieceRate + box) * 100) / 100,
  }
}

export type ComputeLineBreakdownOpts = {
  /** Custom ₹/g from SSR — do not subtract slab R silver offset again. */
  literalCustomMetalRate?: boolean
}

export function computeLineBreakdown(
  line: ErpBillLine,
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
  goldPerG = 0,
  silverPerG = 0,
  goldSlabRShowMc = true,
  opts?: ComputeLineBreakdownOpts,
) {
  if (isSilverGiftMcGmLine(line)) {
    const bd = computeSilverGiftMcGmBreakdown(
      line,
      slab,
      slabSettings,
      silverPerG,
      wholesaleSilver,
      3,
    )
    return finalizeWeightBasedBreakdown(line, bd)
  }

  if (isPiecePricedBillLine(line)) {
    const priced = applyPiecePricedLineCalc(line)
    const total = Number(priced.lineTotalInr) || 0
    const gstPct = 3
    const taxable = total / (1 + gstPct / 100)
    const gstAmt = total - taxable
    return {
      metal: 0,
      mc: 0,
      stone: Number(line.box_charges || 0) || 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable,
      total,
    } satisfies PriceBreakdown
  }

  const metal = String(line.metal_type || '').toLowerCase()
  const slabLine = {
    ...line,
    originalWeightGm: line.originalWeightGm ?? line.weightGm,
  }
  const useStockPieceSlab =
    lineHasPieceSlabFields(slabLine) &&
    metal.startsWith('silver') &&
    !isSilverGiftStockLine(slabLine)
  if (useStockPieceSlab) {
    const adjusted = applyPieceSlabToLine(slabLine, slab)
    const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type)
    const silverOffset = opts?.literalCustomMetalRate
      ? 0
      : slab === 'R'
        ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0)
        : 0
    const mcDisc = isMcPerPiece(adjusted.mc_type)
      ? Math.max(0, Number(tier.mc_discount_pct) || 0)
      : Math.max(0, Number(tier.mc_gm_discount_pct ?? tier.mc_discount_pct) || 0)
    let bd = computeErpPieceSlabBreakdown(
      adjusted,
      slab,
      silverPerG,
      wholesaleSilver,
      3,
      silverOffset,
      mcDisc,
    )
    bd = finalizeWeightBasedBreakdown(line, bd)
    const box = Number(line.box_charges || 0) || 0
    if (box <= 0) return bd
    const gstPct = 3
    const taxable = bd.taxable + box
    const total = Math.round(taxable * (1 + gstPct / 100))
    const gstAmt = total - taxable
    return { ...bd, taxable, total, cgst: gstAmt / 2, sgst: gstAmt / 2 }
  }

  const item = lineToItem(slabLine)
  const ctx = buildSlabContext(
    slab,
    slabSettings,
    wholesaleGold,
    wholesaleSilver,
    line.metal_type,
    goldSlabRShowMc,
  )
  const rates = resolveLineDisplayRates(line, displayRates, goldPerG, silverPerG)
  let bd = calculateBreakdownWithSlab(item, rates, 3, ctx)
  bd = finalizeWeightBasedBreakdown(line, bd)
  const box = Number(line.box_charges || 0) || 0
  if (box <= 0) return bd
  const gstPct = 3
  const taxable = bd.taxable + box
  const total = Math.round(taxable * (1 + gstPct / 100))
  const gstAmt = total - taxable
  return {
    ...bd,
    taxable,
    total,
    cgst: gstAmt / 2,
    sgst: gstAmt / 2,
  }
}

export function parseSlabSettingsFromUser(raw: unknown): ResellerSlabSettings {
  if (raw && typeof raw === 'object' && 'reseller_slab_settings' in (raw as object)) {
    return parseResellerSlabSettings(
      (raw as { reseller_slab_settings?: unknown }).reseller_slab_settings,
    )
  }
  return parseResellerSlabSettings(raw)
}

/** Extract editable ₹/g from display rates payload for UI. */
export function displayRatesToPerGram(displayRates: unknown): { gold: number; silver: number } {
  const arr = Array.isArray(displayRates) ? displayRates : []
  const silverRow = arr.find((r: { metal_type?: string }) => (r.metal_type || '').toLowerCase() === 'silver')
  const goldRow = arr.find((r: { metal_type?: string }) => (r.metal_type || '').toLowerCase() === 'gold')
  const silver = silverRow
    ? Number((silverRow as { display_rate?: number }).display_rate || 0) / 1000
    : 0
  const gold = goldRow ? Number((goldRow as { display_rate?: number }).display_rate || 0) / 10 : 0
  return { gold, silver }
}

/** Build display-rates array from per-gram overrides (billing session only). */
export function perGramToDisplayRates(goldPerG: number, silverPerG: number): unknown[] {
  return [
    { metal_type: 'gold', display_rate: Math.round(goldPerG * 10) },
    { metal_type: 'gold_22k', display_rate: Math.round(goldPerG * 10 * 0.916) },
    { metal_type: 'gold_18k', display_rate: Math.round(goldPerG * 10 * 0.75) },
    { metal_type: 'silver', display_rate: Math.round(silverPerG * 1000) },
  ]
}

export {
  applyPieceSlabToLine,
  lineHasPieceSlabFields,
  pieceSlabBillableWeight,
  pieceSlabMcRate,
  resolveErpSilverMetalRatePerG,
}
