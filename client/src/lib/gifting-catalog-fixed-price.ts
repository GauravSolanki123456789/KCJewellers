import { catalogGiftStyleHint, isGiftingItem, type Item } from '@/lib/pricing'

/** Normalize size labels so `8.5`, `8.5 in`, and `8.5in` match for MRP inference. */
export function normalizeCatalogSizeKey(size: unknown): string {
  const s = String(size ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!s) return ''
  return s.replace(/\s*in\.?\s*$/i, '').trim()
}

function readListMrpExGst(item: Item): number {
  const fp = Number(item.fixed_price ?? 0) || 0
  if (fp > 0) return fp
  const mc = Number(item.mc_rate ?? 0) || 0
  if (mc > 0) return mc
  return 0
}

function isGiftingCatalogRow(item: Item): boolean {
  if (isGiftingItem(item)) return true
  if (catalogGiftStyleHint(item)) return true
  const mt = String(item.metal_type ?? '').toLowerCase()
  if (mt.includes('gift') || mt.includes('plated')) return true
  const wt = Number(item.net_weight ?? item.net_wt ?? item.weight ?? 0) || 0
  return wt <= 0 && readListMrpExGst(item) > 0
}

/**
 * Backfill missing `fixed_price` on gift catalogue rows from siblings with the same size
 * (e.g. BALAJI-PADMAVATHI 8.5 in missing MRP while other god frames at 8.5 show ₹618).
 */
export function enrichGiftingCatalogListPrices<T extends Item>(products: T[]): T[] {
  if (products.length === 0) return products

  const mrpBySize = new Map<string, number>()
  for (const p of products) {
    if (!isGiftingCatalogRow(p)) continue
    const mrp = readListMrpExGst(p)
    if (mrp <= 0) continue
    const sizeKey = normalizeCatalogSizeKey(p.size)
    if (!sizeKey) continue
    const prev = mrpBySize.get(sizeKey)
    if (prev == null || prev === mrp) mrpBySize.set(sizeKey, mrp)
  }

  return products.map((p) => {
    if (!isGiftingCatalogRow(p)) return p
    const direct = readListMrpExGst(p)
    if (direct > 0) {
      const fp = Number(p.fixed_price ?? 0) || 0
      if (fp > 0) return p
      return { ...p, fixed_price: direct }
    }
    const sizeKey = normalizeCatalogSizeKey(p.size)
    const inferred = sizeKey ? mrpBySize.get(sizeKey) : undefined
    if (inferred != null && inferred > 0) {
      return { ...p, fixed_price: inferred }
    }
    return p
  })
}
