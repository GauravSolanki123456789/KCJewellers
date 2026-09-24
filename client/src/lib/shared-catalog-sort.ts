import { inferCatalogMetalParam } from '@/lib/catalog-navigation'
import { CATALOG_METAL_KEYS } from '@/lib/catalog-retail-tags'
import type { SharedCatalogPublicProduct } from '@/lib/shared-catalog-api'
import type { SharedCatalogGroupedRow, SharedCatalogPricingRow } from '@/lib/shared-catalog-pricing'

function metalSortIndex(product: SharedCatalogPublicProduct): number {
  const item = { metal_type: product.metal_type } as { metal_type?: string }
  const key = inferCatalogMetalParam(item)
  const idx = (CATALOG_METAL_KEYS as readonly string[]).indexOf(key)
  return idx >= 0 ? idx : CATALOG_METAL_KEYS.length
}

function styleSortKey(product: SharedCatalogPublicProduct): string {
  const style = String(product.style_name ?? '').trim()
  const sub = String(product.subcategory_name ?? '').trim()
  if (style && sub) return `${style} › ${sub}`
  return style || sub || 'zzz'
}

function skuSortKey(product: SharedCatalogPublicProduct): string {
  return String(product.sku ?? product.barcode ?? product.name ?? '').trim()
}

/** Metal tab order → style → SKU (matches live catalogue hierarchy). */
export function compareSharedCatalogProducts(
  a: SharedCatalogPublicProduct,
  b: SharedCatalogPublicProduct,
): number {
  const m = metalSortIndex(a) - metalSortIndex(b)
  if (m !== 0) return m
  const st = styleSortKey(a).localeCompare(styleSortKey(b), undefined, { sensitivity: 'base' })
  if (st !== 0) return st
  return skuSortKey(a).localeCompare(skuSortKey(b), undefined, { sensitivity: 'base' })
}

export function sortSharedCatalogPricingRows(rows: SharedCatalogPricingRow[]): SharedCatalogPricingRow[] {
  return [...rows].sort((a, b) => compareSharedCatalogProducts(a.product, b.product))
}

export function sortSharedCatalogGroupedRows(groups: SharedCatalogGroupedRow[]): SharedCatalogGroupedRow[] {
  return [...groups].sort((a, b) => {
    const pa = a.variants[0]?.product
    const pb = b.variants[0]?.product
    if (!pa || !pb) return 0
    return compareSharedCatalogProducts(pa, pb)
  })
}
