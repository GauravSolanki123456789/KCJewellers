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
import type { Item } from '@/lib/pricing'
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
  const metal = String(line.metal_type || '').toLowerCase()
  if (lineHasPieceSlabFields(line) && metal.startsWith('silver')) {
    const adjusted = applyPieceSlabToLine(line, slab)
    return computeErpPieceSlabBreakdown(
      adjusted,
      slab,
      silverPerG,
      wholesaleSilver,
      3,
    )
  }

  const item = lineToItem(line)
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
