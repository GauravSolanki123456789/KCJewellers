import {
  CATALOG_METAL_KEYS,
  productMatchesCatalogMetal,
  type CatalogMetalKey,
} from '@/lib/catalog-metal-family'

export type AllowedCategoryMetals = Partial<Record<number, CatalogMetalKey[]>>

export type CatalogTreeProduct = { metal_type?: string | null }
export type CatalogTreeSub = { products?: CatalogTreeProduct[] }
export type CatalogTreeCategory = {
  id: number
  name?: string
  slug?: string
  image_url?: string | null
  subcategories?: CatalogTreeSub[]
}

export function parseAllowedCategoryMetals(raw: unknown): Record<string, CatalogMetalKey[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, CatalogMetalKey[]> = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const catId = parseInt(String(key), 10)
    if (!Number.isFinite(catId) || catId <= 0) continue
    const metals = Array.isArray(val)
      ? val
          .map((m) => String(m || '').trim().toLowerCase())
          .filter((m): m is CatalogMetalKey => CATALOG_METAL_KEYS.includes(m as CatalogMetalKey))
      : []
    if (metals.length) out[String(catId)] = [...new Set(metals)]
  }
  return out
}

function metalsAllowedForCategory(
  categoryId: number,
  allowedCategoryMetals: Record<string, CatalogMetalKey[]> | null | undefined,
): Set<CatalogMetalKey> | null {
  const scoped = allowedCategoryMetals?.[String(categoryId)]
  if (!scoped?.length) return null
  return new Set(scoped)
}

function productAllowedInMetalScope(
  metalType: unknown,
  metalSet: Set<CatalogMetalKey> | null,
): boolean {
  if (!metalSet || metalSet.size === 0) return true
  for (const key of metalSet) {
    if (productMatchesCatalogMetal(metalType, key)) return true
  }
  return false
}

export function filterCatalogForResellerScope(
  categories: CatalogTreeCategory[],
  allowedCategoryIds: number[] | null | undefined,
  allowedCategoryMetals: unknown,
): CatalogTreeCategory[] {
  const ids = Array.isArray(allowedCategoryIds)
    ? allowedCategoryIds.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n) && n > 0)
    : []
  if (!ids.length) return categories

  const metalsMap = parseAllowedCategoryMetals(allowedCategoryMetals)
  const idSet = new Set(ids)

  return categories
    .filter((cat) => idSet.has(cat.id))
    .map((cat) => {
      const metalSet = metalsAllowedForCategory(cat.id, metalsMap)
      if (!metalSet) return cat
      const subcategories = (cat.subcategories || [])
        .map((sub) => ({
          ...sub,
          products: (sub.products || []).filter((p) =>
            productAllowedInMetalScope(p.metal_type, metalSet),
          ),
        }))
        .filter((sub) => (sub.products?.length ?? 0) > 0)
      return { ...cat, subcategories }
    })
    .filter((cat) => (cat.subcategories?.length ?? 0) > 0)
}

export type ResellerCategoryScopeRow = {
  key: string
  categoryId: number
  metal: CatalogMetalKey
  label: string
  hint: string
}

const METAL_LABELS: Record<CatalogMetalKey, string> = {
  gold: 'Gold',
  silver: 'Silver',
  diamond: 'Diamond',
  gifting: 'Gift Items',
}

export function expandResellerCategoryScopes(cat: {
  id: number
  name: string
  product_count?: number
  gold_product_count?: number
  silver_product_count?: number
  diamond_product_count?: number
  gifting_product_count?: number
  has_gold?: boolean
  has_silver?: boolean
  has_diamond?: boolean
  has_gifting?: boolean
}): ResellerCategoryScopeRow[] {
  const parts: { metal: CatalogMetalKey; count: number }[] = []
  if (cat.has_gifting) {
    parts.push({ metal: 'gifting', count: cat.gifting_product_count ?? 0 })
  }
  if (cat.has_gold) {
    parts.push({ metal: 'gold', count: cat.gold_product_count ?? 0 })
  }
  if (cat.has_silver) {
    parts.push({ metal: 'silver', count: cat.silver_product_count ?? 0 })
  }
  if (cat.has_diamond) {
    parts.push({ metal: 'diamond', count: cat.diamond_product_count ?? 0 })
  }
  const active = parts.filter((p) => p.count > 0)
  const list = active.length ? active : parts

  if (list.length <= 1) {
    const metal = list[0]?.metal ?? 'gold'
    const count = list[0]?.count ?? cat.product_count ?? 0
    const countLabel = count === 1 ? '1 product' : `${count} products`
    return [
      {
        key: `${cat.id}:${metal}`,
        categoryId: cat.id,
        metal,
        label: cat.name,
        hint: `${METAL_LABELS[metal]} · ${countLabel}`,
      },
    ]
  }

  return list.map((p) => {
    const countLabel = p.count === 1 ? '1 product' : `${p.count} products`
    return {
      key: `${cat.id}:${p.metal}`,
      categoryId: cat.id,
      metal: p.metal,
      label: `${cat.name} · ${METAL_LABELS[p.metal]}`,
      hint: countLabel,
    }
  })
}

export function isResellerScopeChecked(
  categoryId: number,
  metal: CatalogMetalKey,
  allowedCategoryIds: number[],
  allowedCategoryMetals: Record<string, CatalogMetalKey[]>,
): boolean {
  if (!allowedCategoryIds.includes(categoryId)) return false
  const scoped = allowedCategoryMetals[String(categoryId)]
  if (!scoped?.length) return true
  return scoped.includes(metal)
}

export function defaultScopedMetalsForCategory(
  categoryId: number,
  allowedCategoryIds: number[],
  allowedCategoryMetals: Record<string, CatalogMetalKey[]>,
  categoryScopes: ResellerCategoryScopeRow[],
): CatalogMetalKey[] {
  const key = String(categoryId)
  if (allowedCategoryMetals[key]?.length) return [...allowedCategoryMetals[key]!]
  if (!allowedCategoryIds.includes(categoryId)) return []
  return categoryScopes.filter((s) => s.categoryId === categoryId).map((s) => s.metal)
}

export function toggleResellerCategoryScope(
  categoryId: number,
  metal: CatalogMetalKey,
  allowedCategoryIds: number[],
  allowedCategoryMetals: Record<string, CatalogMetalKey[]>,
  categoryScopes: ResellerCategoryScopeRow[],
): { allowed_category_ids: number[]; allowed_category_metals: Record<string, CatalogMetalKey[]> } {
  const ids = new Set(allowedCategoryIds)
  const metals = { ...allowedCategoryMetals }
  const key = String(categoryId)
  const scoped = defaultScopedMetalsForCategory(
    categoryId,
    allowedCategoryIds,
    allowedCategoryMetals,
    categoryScopes,
  )
  const idx = scoped.indexOf(metal)
  if (idx >= 0) scoped.splice(idx, 1)
  else scoped.push(metal)

  if (scoped.length === 0) {
    delete metals[key]
    ids.delete(categoryId)
  } else {
    metals[key] = [...new Set(scoped)].sort() as CatalogMetalKey[]
    ids.add(categoryId)
  }

  return {
    allowed_category_ids: [...ids].sort((a, b) => a - b),
    allowed_category_metals: metals,
  }
}
