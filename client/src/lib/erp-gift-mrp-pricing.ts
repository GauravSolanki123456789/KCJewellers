import {
  erpSlabToKind,
  isRetailQuoteSlab,
  lineToItem,
  shouldUseWeightSilverNotMrp,
  type ErpRateSlab,
} from '@/lib/erp-billing-pricing'
import { parseResellerSlabSettings, tierSettingsForSlab, type ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { isFixedPriceCatalogItem } from '@/lib/pricing'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

/** Catalogue list MRP for gift / fixed-price stock (before slab Gift/MRP disc %). */
export function resolveGiftMrpListPrice(line: ErpBillLine): number {
  const stored = Number(line.mrpListPrice)
  if (Number.isFinite(stored) && stored > 0) return stored
  const wt = Number(line.originalWeightGm ?? line.weightGm ?? 0) || 0
  if (line.manualCategory === 'gift' || line.mrpMode) {
    const fixed = Number(line.fixed_price ?? line.unitInr ?? 0)
    return Number.isFinite(fixed) && fixed > 0 ? fixed : 0
  }
  const inv = String(line.invoice_item_name || '').toUpperCase()
  const item = lineToItem(line)
  const fixedPriceGift = isFixedPriceCatalogItem(item) && wt <= 0
  if (!fixedPriceGift && !inv.includes('GIFT ITEM')) return 0
  const fixed = Number(line.fixed_price ?? line.unitInr ?? 0)
  return Number.isFinite(fixed) && fixed > 0 ? fixed : 0
}

/** Gift / MRP disc % for a billing slab. Slab F uses its own %, or Slab W if F is unset. */
export function giftMrpDiscountPct(
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): number {
  if (isRetailQuoteSlab(slab)) return 0
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
/** Re-apply Gift / MRP disc % from catalogue list MRP on every line recalc. */
export function applyGiftMrpPieceRate(
  line: ErpBillLine,
  slab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): ErpBillLine {
  if (line.manualCategory === 'shipping') return line
  if (shouldUseWeightSilverNotMrp(line)) {
    return { ...line, mrpMode: false, mrpListPrice: null, unitInr: null }
  }
  const list = resolveGiftMrpListPrice(line)
  if (list <= 0) return line
  const slabPrice = giftMrpSlabPrice(list, slab, slabSettings)
  return {
    ...line,
    mrpListPrice: list,
    fixed_price: slabPrice,
    unitInr: slabPrice,
    mrpMode: true,
  }
}

export function applyGiftMrpForSlabChange(
  line: ErpBillLine,
  nextSlab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
): ErpBillLine {
  if (line.manualCategory === 'shipping') return line
  const list = resolveGiftMrpListPrice(line)
  if (list <= 0) return line
  if (!line.mrpMode && line.manualCategory !== 'gift') {
    const inv = String(line.invoice_item_name || '').toUpperCase()
    const item = lineToItem(line)
    const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0) || 0
    if (!inv.includes('GIFT') && !(isFixedPriceCatalogItem(item) && wt <= 0)) return line
  }
  const slabPrice = giftMrpSlabPrice(list, nextSlab, slabSettings)
  return {
    ...line,
    mrpListPrice: list,
    fixed_price: slabPrice,
    unitInr: slabPrice,
    mrpMode: true,
  }
}
