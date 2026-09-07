import { erpSlabToKind, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import { parseResellerSlabSettings, tierSettingsForSlab, type ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

/** Slab-adjusted gift/MRP piece rate from catalogue MRP (Gift / MRP disc %). */
export function giftMrpSlabPrice(
  mrp: number,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): number {
  const m = Number(mrp)
  if (!Number.isFinite(m) || m <= 0) return 0
  const tier = tierSettingsForSlab(slabSettings, erpSlabToKind(slab), 'gifting')
  const disc = Math.max(0, Math.min(100, Number(tier.gift_discount_pct) || 0))
  return Math.round(m * (1 - disc / 100) * 100) / 100
}

export function parseResellerSlabSettingsFromUser(raw: unknown): ResellerSlabSettings {
  if (raw && typeof raw === 'object' && 'reseller_slab_settings' in (raw as object)) {
    return parseResellerSlabSettings((raw as { reseller_slab_settings?: unknown }).reseller_slab_settings)
  }
  return parseResellerSlabSettings(raw)
}

/** Re-apply Gift / MRP disc % from the stored list MRP when the billing slab changes. */
export function applyGiftMrpForSlabChange(
  line: ErpBillLine,
  nextSlab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): ErpBillLine {
  const list = Number(line.mrpListPrice)
  if (!Number.isFinite(list) || list <= 0) return line
  if (!line.mrpMode && line.manualCategory !== 'gift') return line
  const slabPrice = giftMrpSlabPrice(list, nextSlab, slabSettings)
  return {
    ...line,
    fixed_price: slabPrice,
    unitInr: slabPrice,
    mrpMode: true,
  }
}
