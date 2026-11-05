import type { Item } from '@/lib/pricing'
import { parseProductStockQty } from '@/lib/live-stock'

/** Matches services/productBrandUtils.js MAKE_TO_ORDER_EXCEL_BRANDS */
const MAKE_TO_ORDER_EXCEL_BRANDS = new Set(['emerald', 'utsarva'])

function catalogLiveStockEnabled(
  product: Item | Record<string, unknown> | null | undefined,
  options?: { catalogShowLiveStock?: boolean },
): boolean {
  if (options?.catalogShowLiveStock === true) return true
  if (options?.catalogShowLiveStock === false) return false
  return !!(
    product?.reseller_show_live_stock === true ||
    product?.show_live_stock === true ||
    (product as { showLiveStock?: boolean })?.showLiveStock === true
  )
}

/** Excel Brand column (emerald, utsarva, …) and explicit make_to_order_only flag. */
export function isMakeToOrderOnlyProduct(
  product: Item | Record<string, unknown> | null | undefined,
  options?: { catalogShowLiveStock?: boolean },
): boolean {
  if (!product) return false
  if (catalogLiveStockEnabled(product, options)) return false
  if (product.make_to_order_only === true || product.makeToOrderOnly === true) return true
  const brand = String(product.brand ?? '').trim().toLowerCase()
  return brand !== '' && MAKE_TO_ORDER_EXCEL_BRANDS.has(brand)
}

/** Shared / storefront: in-stock rows sort before qty 0 (make on order label). */
export function compareLiveStockDisplayOrder(
  a: { quantity?: unknown; pcs?: unknown },
  b: { quantity?: unknown; pcs?: unknown },
): number {
  const liveA = parseProductStockQty(a.quantity ?? a.pcs) > 0 ? 0 : 1
  const liveB = parseProductStockQty(b.quantity ?? b.pcs) > 0 ? 0 : 1
  return liveA - liveB
}

export function makeToOrderStockLabel(): string {
  return 'Make on order'
}
