import { erpSlabToKind, type ErpRateSlab } from '@/lib/erp-billing-pricing'
import { parseResellerSlabSettings, tierSettingsForSlab, type ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

/** Gift / MRP disc % for a billing slab. Slab F uses its own %, or Slab W if F is unset. */
export function giftMrpDiscountPct(
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): number {
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Number(n) || 0))
  const own = clamp(tierSettingsForSlab(slabSettings, erpSlabToKind(slab), 'gifting').gift_discount_pct)
  if (slab === 'F' && own === 0) {
    return clamp(tierSettingsForSlab(slabSettings, 'slab_w', 'gifting').gift_discount_pct)
  }
  return own
}

/** Slab-adjusted gift/MRP piece rate from catalogue MRP (Gift / MRP disc %). */
export function giftMrpSlabPrice(
  mrp: number,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): number {
  const m = Number(mrp)
  if (!Number.isFinite(m) || m <= 0) return 0
  const disc = giftMrpDiscountPct(slab, slabSettings)
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
  if (!line.mrpMode && line.manualCategory !== 'gift') {
    const inv = String(line.invoice_item_name || '').toUpperCase()
    if (!inv.includes('GIFT')) return line
  }
  const slabPrice = giftMrpSlabPrice(list, nextSlab, slabSettings)
  return {
    ...line,
    fixed_price: slabPrice,
    unitInr: slabPrice,
    mrpMode: true,
  }
}
