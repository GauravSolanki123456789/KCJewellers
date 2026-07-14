import type { SharedCatalogPublicProduct } from '@/lib/shared-catalog-api'
import type { SharedCatalogGroupedRow, SharedCatalogPricingRow } from '@/lib/shared-catalog-pricing'

export const SHARED_CATALOG_ALL_TAB = 'all'

export type SharedCatalogSubcategoryTab = {
  key: string
  label: string
  count: number
  styleName: string | null
}

function subcategoryKeyFromProduct(p: SharedCatalogPublicProduct | undefined): string {
  if (!p) return 'other'
  const id = p.subcategory_id
  if (id != null && String(id).trim()) return `sc:${String(id).trim()}`
  const name = String(p.subcategory_name ?? '').trim()
  if (name) return `n:${name.toLowerCase()}`
  return 'other'
}

export function sharedCatalogSubcategoryKeyForGroup(group: SharedCatalogGroupedRow): string {
  return subcategoryKeyFromProduct(group.variants[0]?.product)
}

export function sharedCatalogSubcategoryLabelForGroup(group: SharedCatalogGroupedRow): string {
  const p = group.variants[0]?.product
  const name = String(p?.subcategory_name ?? '').trim()
  return name || 'Other'
}

/** Distinct subcategory tabs from shared brochure rows (e.g. L_STAND, GOD FRAMES). */
export function buildSharedCatalogSubcategoryTabs(
  rows: SharedCatalogPricingRow[],
): SharedCatalogSubcategoryTab[] {
  const buckets = new Map<
    string,
    { label: string; count: number; sort: number; styleName: string | null }
  >()

  for (const row of rows) {
    const p = row.product
    const key = subcategoryKeyFromProduct(p)
    const label = String(p?.subcategory_name ?? '').trim() || 'Other'
    const sort = Number(p?.subcategory_sort_order ?? 999)
    const styleName = String(p?.style_name ?? '').trim() || null
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
    } else {
      buckets.set(key, { label, count: 1, sort, styleName })
    }
  }

  const styleNames = new Set(
    [...buckets.values()].map((b) => b.styleName).filter(Boolean) as string[],
  )
  const prefixStyle = styleNames.size > 1

  return [...buckets.entries()]
    .sort(
      (a, b) =>
        a[1].sort - b[1].sort ||
        a[1].label.localeCompare(b[1].label, undefined, { sensitivity: 'base' }),
    )
    .map(([key, v]) => ({
      key,
      label: prefixStyle && v.styleName ? `${v.styleName} › ${v.label}` : v.label,
      count: v.count,
      styleName: v.styleName,
    }))
}

export function filterSharedCatalogGroupsBySubcategory(
  groups: SharedCatalogGroupedRow[],
  activeKey: string,
): SharedCatalogGroupedRow[] {
  if (activeKey === SHARED_CATALOG_ALL_TAB) return groups
  return groups.filter((g) => sharedCatalogSubcategoryKeyForGroup(g) === activeKey)
}

export type SharedCatalogSubcategoryNav = {
  prev: SharedCatalogSubcategoryTab | null
  next: SharedCatalogSubcategoryTab | null
  current: SharedCatalogSubcategoryTab | null
  currentIndex: number
}

/** Prev/next tab within ordered subcategory list (excludes "All"). */
export function getSharedCatalogSubcategoryNav(
  tabs: SharedCatalogSubcategoryTab[],
  activeKey: string,
): SharedCatalogSubcategoryNav {
  if (activeKey === SHARED_CATALOG_ALL_TAB || tabs.length === 0) {
    return {
      prev: null,
      next: tabs[0] ?? null,
      current: null,
      currentIndex: -1,
    }
  }
  const idx = tabs.findIndex((t) => t.key === activeKey)
  if (idx < 0) {
    return { prev: null, next: tabs[0] ?? null, current: null, currentIndex: -1 }
  }
  return {
    prev: idx > 0 ? tabs[idx - 1] : null,
    next: idx < tabs.length - 1 ? tabs[idx + 1] : null,
    current: tabs[idx],
    currentIndex: idx,
  }
}
