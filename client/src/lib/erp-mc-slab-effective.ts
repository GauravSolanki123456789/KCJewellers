import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import {
  tierSettingsForSlab,
  type CatalogSlabKind,
  type ResellerSlabSettings,
} from '@/lib/catalog-slab-pricing'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'
import { isMcPerPiece } from '@/lib/pricing'

function slabToKind(slab: ErpRateSlab): CatalogSlabKind {
  if (slab === 'R1') return 'slab_r1'
  if (slab === 'W') return 'slab_w'
  if (slab === 'F') return 'slab_f'
  if (slab === 'Q') return 'standard'
  return 'slab_r'
}

function clampPct(n: unknown): number {
  return Math.max(0, Math.min(100, Number(n) || 0))
}

function roundMc(n: number): number {
  return Math.round(n * 100) / 100
}

/** G-enter gift / shipping — Gift/MRP disc or GST-exempt fixed, not catalogue MC/PC %. */
export function skipCatalogMcPcDiscount(line: ErpBillLine): boolean {
  return line.manualCategory === 'gift' || line.manualCategory === 'shipping'
}

/** Absolute catalogue MCRate (Excel/design), never the already-discounted W/F column. */
export function erpCatalogMcPerUnit(line: ErpBillLine): number {
  const cat = Number(line.mc_rate_catalog ?? 0)
  if (Number.isFinite(cat) && cat > 0) return cat
  const mc = Number(line.mc_rate ?? 0) || 0
  const r = Number(line.mc_rate_slab_r ?? 0) || 0
  const r1 = Number(line.mc_rate_slab_r1 ?? 0) || 0
  const w = Number(line.mc_rate_slab_w ?? 0) || 0
  const f = Number(line.mc_rate_slab_f ?? 0) || 0
  const candidates = [mc, r, r1, w, f].filter((n) => n > 0)
  if (!candidates.length) return 0
  return Math.max(...candidates)
}

export function inferMcRateCatalogPatch(line: ErpBillLine): Partial<ErpBillLine> | null {
  if (line.mc_rate_catalog != null && Number(line.mc_rate_catalog) > 0) return null
  const catalog = erpCatalogMcPerUnit(line)
  if (catalog <= 0) return null
  return { mc_rate_catalog: catalog }
}

export function erpTierMcDiscountPct(
  line: ErpBillLine,
  slab: ErpRateSlab,
  slabSettings?: ResellerSlabSettings | null,
): number {
  if (!slabSettings || skipCatalogMcPcDiscount(line)) return 0
  const tier = tierSettingsForSlab(slabSettings, slabToKind(slab), line.metal_type || 'silver')
  if (isMcPerGmBillingType(line.mc_type)) {
    return clampPct(tier.mc_gm_discount_pct ?? 0)
  }
  if (isMcPerPiece(line.mc_type)) {
    return clampPct(tier.mc_discount_pct)
  }
  return 0
}

/**
 * Billable ₹/pc (or ₹/gm) after catalogue slab MC disc — once.
 * Base 450 + Slab W 50% → 225. Never 225 × 50% again (the 113 bug).
 */
export function erpEffectiveMcPerUnit(
  line: ErpBillLine,
  slab: ErpRateSlab,
  slabSettings?: ResellerSlabSettings | null,
): number {
  const catalog = erpCatalogMcPerUnit(line)
  if (catalog <= 0) return 0
  if (skipCatalogMcPcDiscount(line)) return catalog
  const pct = erpTierMcDiscountPct(line, slab, slabSettings)
  if (pct <= 0) return roundMc(catalog)
  return roundMc(catalog * (1 - pct / 100))
}
