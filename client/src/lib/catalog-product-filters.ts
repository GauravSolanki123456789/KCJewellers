import {
  CATALOG_METAL_KEYS,
  type CatalogMetalKey,
} from '@/lib/catalog-retail-tags'
import {
  calculateBreakdown,
  isFixedPriceCatalogItem,
  type Item,
  type WholesalePricingInput,
} from '@/lib/pricing'

export type { CatalogMetalKey }

const METAL_ORDER: CatalogMetalKey[] = [...CATALOG_METAL_KEYS]

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

/** Count products in the catalogue for a given metal tab (for validating persisted wholesale state). */
export function countProductsForMetal(
  categories: { subcategories: { products: Item[] }[] }[],
  metal: CatalogMetalKey,
): number {
  let n = 0
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        if (productMatchesMetal(p, metal)) n++
      }
    }
  }
  return n
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
  if (metal === 'gifting') return m.startsWith('gifting') || m.includes('gifting')
  return false
}

/** Stable id for selection state — matches ProductCard `data-product-id` (barcode preferred). */
export function getProductSelectionKey(product: Item): string {
  return String(product.barcode ?? product.sku ?? product.id ?? '').trim()
}

/** Decode `/products/[id]` route param — same cap as API (64 chars). */
export function normalizeStorefrontProductId(raw: string): string {
  try {
    return decodeURIComponent(String(raw || '').trim()).slice(0, 64)
  } catch {
    return String(raw || '').trim().slice(0, 64)
  }
}

/** True when row matches the storefront URL key (barcode, sku, or id). */
export function productMatchesStorefrontId(product: Item, routeId: string): boolean {
  const key = normalizeStorefrontProductId(routeId).toLowerCase()
  if (!key) return false
  const candidates = [product.barcode, product.sku, product.id != null ? String(product.id) : '']
    .map((x) => String(x ?? '').trim().toLowerCase())
    .filter(Boolean)
  return candidates.includes(key)
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
  if (!isFixedPriceCatalogItem(product)) {
    const w = product.net_weight ?? product.net_wt ?? product.weight ?? 0
    const wt = Number(w) || 0
    if (wt < weightLow || wt > weightHigh) return false
  }
  const b = calculateBreakdown(
    product,
    rates,
    (product as { gst_rate?: number }).gst_rate ?? 3,
    wholesale,
  )
  return b.total >= priceLow && b.total <= priceHigh
}
