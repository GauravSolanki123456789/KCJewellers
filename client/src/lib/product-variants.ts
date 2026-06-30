import {
  getCustomerDisplaySize,
  isGiftingItem,
  type Item,
} from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'

/** Attached on catalogue cards when multiple `design_group` rows share one product family. */
export type ItemWithVariants = Item & { variants?: Item[] }

export function getDesignGroupKey(item: Item | null | undefined): string {
  return String(item?.design_group ?? '').trim()
}

/**
 * Unique variant family key — design_group alone is not enough (GANESH exists in IDOLS and L_STAND).
 */
export function getVariantGroupKey(item: Item | null | undefined): string {
  const dg = getDesignGroupKey(item)
  if (!dg) return ''
  const subId = (item as { subcategory_id?: unknown }).subcategory_id
  if (subId != null && String(subId).trim() !== '') {
    return `${String(subId).trim()}\0${dg}`
  }
  const subSlug = String(
    (item as { subcategory_slug?: unknown }).subcategory_slug ?? '',
  ).trim()
  if (subSlug) return `${subSlug.toLowerCase()}\0${dg}`
  return dg
}

export function variantDisplayTitle(item: Item): string {
  const dg = getDesignGroupKey(item)
  if (dg) return dg
  const named = (item as { name?: string }).name
  return named || item.item_name || item.short_name || getProductSelectionKey(item) || 'Item'
}

export function compareVariantBySize(a: Item, b: Item): number {
  const sa = getCustomerDisplaySize(a) || String(a.size ?? '')
  const sb = getCustomerDisplaySize(b) || String(b.size ?? '')
  return sa.localeCompare(sb, undefined, { numeric: true })
}

export function sortSizeVariants(variants: Item[]): Item[] {
  return [...variants].sort(compareVariantBySize)
}

/**
 * Which size chips to show around the selection (prev · current · next) — no horizontal scroll.
 */
export function visibleSizeVariantIndices(total: number, selectedIdx: number): number[] {
  if (total <= 0) return []
  if (total <= 2) return [...Array(total).keys()]
  const idx = Math.max(0, Math.min(selectedIdx, total - 1))
  if (idx <= 0) return [0, 1]
  if (idx >= total - 1) return [total - 2, total - 1]
  return [idx - 1, idx, idx + 1]
}

export function getAttachedVariants(product: ItemWithVariants): Item[] {
  const list = product.variants
  if (Array.isArray(list) && list.length > 0) return sortSizeVariants(list)
  return [product]
}

/** One grid card per `design_group` for gifting rows with multiple sizes. */
export function collapseGiftingVariantRows(products: Item[]): ItemWithVariants[] {
  const singles: ItemWithVariants[] = []
  const byGroup = new Map<string, Item[]>()

  for (const p of products) {
    const groupKey = getVariantGroupKey(p)
    if (!groupKey || !isGiftingItem(p)) {
      singles.push(p)
      continue
    }
    const bucket = byGroup.get(groupKey) ?? []
    bucket.push(p)
    byGroup.set(groupKey, bucket)
  }

  const grouped: ItemWithVariants[] = []
  for (const list of byGroup.values()) {
    const variants = sortSizeVariants(list)
    if (variants.length === 1) {
      grouped.push(variants[0])
    } else {
      const lead = variants[0]
      grouped.push({ ...lead, variants })
    }
  }

  return [...singles, ...grouped]
}

export function variantMatchesBarcode(variant: Item, barcode: string): boolean {
  const key = barcode.trim().toLowerCase()
  if (!key) return false
  const keys = [
    getProductSelectionKey(variant),
    String(variant.barcode ?? ''),
    String(variant.sku ?? ''),
  ]
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
  return keys.includes(key)
}

export function findVariantByBarcode(
  variants: Item[],
  barcode: string,
): Item | undefined {
  return variants.find((v) => variantMatchesBarcode(v, barcode))
}
