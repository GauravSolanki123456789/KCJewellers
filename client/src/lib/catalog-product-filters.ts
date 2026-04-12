import { calculateBreakdown, type Item, type WholesalePricingInput } from '@/lib/pricing'

/** Metal tab keys — match `metal_type` filtering on the catalogue (see METAL_TABS in catalog-page-client). */
export type CatalogMetalKey = 'gold' | 'silver' | 'diamond'

/** Default tab order (Gold → Silver → Diamond) — used for “first metal with stock”. */
export const METAL_TAB_ORDER: readonly CatalogMetalKey[] = ['gold', 'silver', 'diamond']

export type CatalogProductRow = {
  product: Item
  categoryName: string
  subcategoryName: string
}

type CategoryLike = {
  name: string
  subcategories: { name: string; products: Item[] }[]
}

/** Flatten catalogue tree for one metal, with category paths for search (same tree as retail catalogue). */
export function flattenProductsForMetal(
  categories: CategoryLike[],
  metal: CatalogMetalKey,
): CatalogProductRow[] {
  const out: CatalogProductRow[] = []
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        if (productMatchesMetal(p, metal)) {
          out.push({ product: p, categoryName: c.name, subcategoryName: s.name })
        }
      }
    }
  }
  return out
}

/** First metal tab that has at least one product (e.g. skip empty Gold → land on Silver). */
export function firstMetalWithProducts(categories: CategoryLike[]): CatalogMetalKey {
  const all = categories.flatMap((c) => c.subcategories.flatMap((s) => s.products))
  for (const m of METAL_TAB_ORDER) {
    if (all.some((p) => productMatchesMetal(p, m))) return m
  }
  return 'gold'
}

/** Lowercase haystack for keyword search — SKU, names, style, category path, and short string fields on the item. */
export function wholesaleProductSearchHaystack(row: CatalogProductRow): string {
  const p = row.product
  const parts: string[] = [
    row.categoryName,
    row.subcategoryName,
    p.barcode != null ? String(p.barcode) : '',
    p.sku != null ? String(p.sku) : '',
    p.item_name != null ? String(p.item_name) : '',
    p.short_name != null ? String(p.short_name) : '',
    p.style_code != null ? String(p.style_code) : '',
    p.metal_type != null ? String(p.metal_type) : '',
    p.id != null ? String(p.id) : '',
  ]
  for (const [k, v] of Object.entries(p)) {
    if (v == null || typeof v !== 'string') continue
    if (v.length > 160) continue
    if (k === 'image_url') continue
    parts.push(v)
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

/** Every whitespace-separated token must appear as a substring (matches design names, SKUs, paths). */
export function productMatchesSearchQuery(row: CatalogProductRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = wholesaleProductSearchHaystack(row)
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((t) => hay.includes(t))
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
