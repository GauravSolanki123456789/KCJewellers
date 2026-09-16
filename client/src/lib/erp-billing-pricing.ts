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
import { isMcPerPiece, type Item, type PriceBreakdown } from '@/lib/pricing'
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

/** Align ERP billing with shared catalogue slab math (no wastage % on silver gift stock). */
export function normalizeLineForCatalogSlabPricing(line: ErpBillLine): ErpBillLine {
  if (!isSilverGiftStockLine(line)) return line
  const net = line.originalWeightGm ?? line.weightGm
  if (line.wastage_pct != null && Number(line.wastage_pct) > 0) {
    return {
      ...line,
      wastage_pct: 0,
      originalWeightGm: net ?? line.originalWeightGm,
      weightGm: net ?? line.weightGm,
    }
  }
  return line
}

export function lineToItem(line: ErpBillLine): Item {
  const normalized = normalizeLineForCatalogSlabPricing(line)
  return {
    barcode: normalized.barcode || normalized.code,
    sku: normalized.sku,
    item_name: normalized.name,
    style_code: normalized.style_code,
    metal_type: normalized.metal_type || 'silver',
    net_weight: normalized.weightGm ?? undefined,
    net_wt: normalized.weightGm ?? undefined,
    purity: normalized.purity ?? 925,
    wastage_pct: normalized.wastage_pct ?? undefined,
    mc_rate: normalized.mc_rate ?? undefined,
    mc_type: normalized.mc_type ?? undefined,
    stone_charges: normalized.stone_charges ?? 0,
    stone_wt: normalized.stone_wt ?? undefined,
    box_charges: normalized.box_charges ?? 0,
    fixed_price: normalized.fixed_price ?? undefined,
    size: normalized.size ?? undefined,
    pcs: normalized.qty ?? 1,
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

/** Apply per-line Rate column override to the rates payload used for slab math. */
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

  if (line.rateLocked || line.ratePerGram == null || !Number.isFinite(line.ratePerGram)) {
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

/** Gift / MRP / fixed piece-rate rows (qty × fixed price, no weight-based metal math). */
export function isPiecePricedBillLine(line: ErpBillLine): boolean {
  if (line.mrpMode || line.manualCategory === 'gift') return true
  const pieceRate = Number(line.unitInr ?? line.fixed_price ?? 0)
  const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0)
  return pieceRate > 0 && wt <= 0
}

export function applyPiecePricedLineCalc(line: ErpBillLine): ErpBillLine {
  const parsed = Number(line.qty)
  const isGift = line.manualCategory === 'gift' || !!line.mrpMode
  const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : isGift ? 0 : 1
  const pieceRate = Number(line.unitInr ?? line.fixed_price ?? line.ratePerGram) || 0
  return {
    ...line,
    qty,
    unitInr: pieceRate > 0 ? pieceRate : line.unitInr,
    lineTotalInr: Math.round(qty * pieceRate * 100) / 100,
  }
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
) {
  if (isPiecePricedBillLine(line)) {
    const priced = applyPiecePricedLineCalc(line)
    const total = Number(priced.lineTotalInr) || 0
    const gstPct = 3
    const taxable = total / (1 + gstPct / 100)
    const gstAmt = total - taxable
    return {
      metal: 0,
      mc: 0,
      stone: 0,
      cgst: gstAmt / 2,
      sgst: gstAmt / 2,
      taxable,
      total,
    } satisfies PriceBreakdown
  }

  const metal = String(line.metal_type || '').toLowerCase()
  const slabLine = normalizeLineForCatalogSlabPricing(line)
  if (lineHasPieceSlabFields(slabLine) && metal.startsWith('silver')) {
    const adjusted = applyPieceSlabToLine(slabLine, slab)
    const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), line.metal_type)
    const silverOffset =
      slab === 'R' ? Math.max(0, Number(tier.silver_rate_offset_per_g) || 0) : 0
    const mcDisc = isMcPerPiece(adjusted.mc_type)
      ? Math.max(0, Number(tier.mc_discount_pct) || 0)
      : Math.max(0, Number(tier.mc_gm_discount_pct ?? tier.mc_discount_pct) || 0)
    return computeErpPieceSlabBreakdown(
      adjusted,
      slab,
      silverPerG,
      wholesaleSilver,
      3,
      silverOffset,
      mcDisc,
    )
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
  return calculateBreakdownWithSlab(item, rates, 3, ctx)
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
