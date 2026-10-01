import type { Item } from '@/lib/pricing'

/** Matches services/productBrandUtils.js MAKE_TO_ORDER_EXCEL_BRANDS */
const MAKE_TO_ORDER_EXCEL_BRANDS = new Set(['emerald', 'utsarva'])

/** Excel Brand column (emerald, utsarva, …) and explicit make_to_order_only flag. */
export function isMakeToOrderOnlyProduct(
  product: Item | Record<string, unknown> | null | undefined,
): boolean {
  if (!product) return false
  if (product.make_to_order_only === true || product.makeToOrderOnly === true) return true
  const brand = String(product.brand ?? '').trim().toLowerCase()
  return brand !== '' && MAKE_TO_ORDER_EXCEL_BRANDS.has(brand)
}

export function makeToOrderStockLabel(): string {
  return 'Make on order'
}
