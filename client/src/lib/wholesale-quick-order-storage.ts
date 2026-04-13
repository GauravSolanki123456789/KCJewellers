import type { CatalogMetalKey } from '@/lib/catalog-product-filters'

export const WHOLESALE_QUICK_ORDER_STORAGE_KEY = 'kc_wholesale_quick_order_v1'

export type WholesaleQuickOrderPersisted = {
  v: 1
  metal: CatalogMetalKey
  qtyByKey: Record<string, number>
  searchQuery: string
  weightLow: number
  weightHigh: number
  priceLow: number
  priceHigh: number
  bulkQtyDraft: string
}

export function readWholesaleQuickOrder(): WholesaleQuickOrderPersisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WHOLESALE_QUICK_ORDER_STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as WholesaleQuickOrderPersisted
    if (p.v !== 1 || !p.metal) return null
    return p
  } catch {
    return null
  }
}

export function writeWholesaleQuickOrder(data: WholesaleQuickOrderPersisted): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(WHOLESALE_QUICK_ORDER_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

export function clearWholesaleQuickOrderStorage(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(WHOLESALE_QUICK_ORDER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
