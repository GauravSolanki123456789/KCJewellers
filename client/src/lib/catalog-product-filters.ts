import { calculateBreakdown, type Item, type WholesalePricingInput } from '@/lib/pricing'

/** Metal tab keys — match `metal_type` filtering on the catalogue (see METAL_TABS in catalog-page-client). */
export type CatalogMetalKey = 'gold' | 'silver' | 'diamond'

const METAL_ORDER: CatalogMetalKey[] = ['gold', 'silver', 'diamond']

/**
 * First metal tab that has at least one product (e.g. skip empty Gold → land on Silver).
 * Falls back to `gold` if none match (empty catalogue).
 */
export function firstMetalWithProducts(
  categories: { subcategories: { products: Item[] }[] }[],
): CatalogMetalKey {
  for (const m of METAL_ORDER) {
    let n = 0
    for (const c of categories) {
      for (const s of c.subcategories) {
        for (const p of s.products) {
          if (productMatchesMetal(p, m)) n++
        }
      }
    }
    if (n > 0) return m
  }
  return 'gold'
}

export type WholesaleProductRow = {
  product: Item
  styleName: string
  subcategoryName: string
}

/** Flatten catalogue tree for wholesale matrix with style / SKU category labels for search. */
export function flattenWholesaleRows(
  categories: { name: string; subcategories: { name: string; products: Item[] }[] }[],
  metal: CatalogMetalKey,
): WholesaleProductRow[] {
  const out: WholesaleProductRow[] = []
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        if (productMatchesMetal(p, metal)) {
          out.push({ product: p, styleName: c.name, subcategoryName: s.name })
        }
      }
    }
  }
  return out
}

/** Case-insensitive match on SKU, names, style code, and category labels (same fields as catalogue). */
export function wholesaleRowMatchesSearch(row: WholesaleProductRow, query: string): boolean {
  const t = query.trim().toLowerCase()
  if (!t) return true
  const p = row.product
  const parts = [
    p.barcode,
    p.sku,
    p.item_name,
    p.short_name,
    p.style_code,
    row.styleName,
    row.subcategoryName,
    p.metal_type,
  ]
  return parts.some((x) => x != null && String(x).toLowerCase().includes(t))
}

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

/** Lookup by barcode/sku key and by `row-${sku}` fallback used in wholesale matrix rows. */
export function buildCatalogProductByKeyMap(
  categories: { subcategories: { products: Item[] }[] }[],
): Map<string, Item> {
  const m = new Map<string, Item>()
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        const k = getProductSelectionKey(p)
        if (k) m.set(k, p)
        const sku = String(p.sku ?? '').trim()
        if (sku) {
          const alt = `row-${sku}`
          if (!m.has(alt)) m.set(alt, p)
        }
      }
    }
  }
  return m
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
