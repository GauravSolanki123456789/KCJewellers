import { calculateBreakdown, type Item, type WholesalePricingInput } from '@/lib/pricing'

/** Metal tab keys — match `metal_type` filtering on the catalogue (see METAL_TABS in catalog-page-client). */
export type CatalogMetalKey = 'gold' | 'silver' | 'diamond'

export function productMatchesMetal(product: Item, metal: CatalogMetalKey): boolean {
  const m = (product.metal_type || '').toLowerCase()
  if (metal === 'gold') return m.startsWith('gold') || m.includes('gold')
  if (metal === 'silver') return m.startsWith('silver') || m.includes('silver')
  if (metal === 'diamond') return m.startsWith('diamond') || m.includes('diamond')
  return false
}

/** Stable id for selection state — matches ProductCard `data-product-id` (barcode preferred). */
export function getProductSelectionKey(product: Item): string {
  return String(product.barcode ?? product.sku ?? product.id ?? '').trim()
}

/**
 * Same weight + price bounds as the catalogue grid (dual sliders), for a single product row.
 */
export function productPassesCatalogFilters(
  product: Item,
  metal: CatalogMetalKey,
  weightLow: number,
  weightHigh: number,
  priceLow: number,
  priceHigh: number,
  rates: unknown,
  wholesale?: WholesalePricingInput | null,
): boolean {
  if (!productMatchesMetal(product, metal)) return false
  const w = product.net_weight ?? product.net_wt ?? product.weight ?? 0
  const wt = Number(w) || 0
  if (wt < weightLow || wt > weightHigh) return false
  const b = calculateBreakdown(
    product,
    rates,
    (product as { gst_rate?: number }).gst_rate ?? 3,
    wholesale,
  )
  return b.total >= priceLow && b.total <= priceHigh
}
