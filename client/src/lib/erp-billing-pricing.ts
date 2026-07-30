import {
  calculateBreakdownWithSlab,
  parseResellerSlabSettings,
  tierSettingsForSlab,
  type CatalogSlabKind,
  type ResellerSlabSettings,
  type SharedCatalogSlabContext,
} from '@/lib/catalog-slab-pricing'
import type { Item } from '@/lib/pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type ErpRateSlab = 'R' | 'W' | 'F'

export function erpSlabToKind(slab: ErpRateSlab): CatalogSlabKind {
  if (slab === 'W') return 'slab_w'
  if (slab === 'F') return 'slab_f'
  return 'slab_r'
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
): SharedCatalogSlabContext {
  const kind = erpSlabToKind(slab)
  return {
    kind,
    settings: tierSettingsForSlab(settings, kind),
    wholesaleGoldRatePerG: wholesaleGold ?? null,
    wholesaleSilverRatePerG: wholesaleSilver ?? null,
  }
}

export function computeLineTotal(
  line: ErpBillLine,
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
): number {
  return computeLineBreakdown(line, displayRates, slab, slabSettings, wholesaleGold, wholesaleSilver).total
}

export function computeLineBreakdown(
  line: ErpBillLine,
  displayRates: unknown,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  wholesaleGold?: number | null,
  wholesaleSilver?: number | null,
) {
  const item = lineToItem(line)
  const ctx = buildSlabContext(slab, slabSettings, wholesaleGold, wholesaleSilver)
  return calculateBreakdownWithSlab(item, displayRates, 3, ctx)
}

export function parseSlabSettingsFromUser(raw: unknown): ResellerSlabSettings {
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
