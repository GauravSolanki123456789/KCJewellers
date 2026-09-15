import type { Item } from '@/lib/pricing'

/** Emerald brand Excel uploads and explicit make_to_order_only flag. */
export function isMakeToOrderOnlyProduct(
  product: Item | Record<string, unknown> | null | undefined,
): boolean {
  if (!product) return false
  if (product.make_to_order_only === true || product.makeToOrderOnly === true) return true
  const brand = String(product.brand ?? '').trim().toLowerCase()
  return brand === 'emerald'
}

export function makeToOrderStockLabel(): string {
  return 'Make on order'
}
