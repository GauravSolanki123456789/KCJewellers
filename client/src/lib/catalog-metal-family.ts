/** Must stay aligned with services/catalogMetalFamily.js */

export type CatalogMetalKey = 'gold' | 'silver' | 'diamond' | 'gifting'

export const CATALOG_METAL_KEYS: CatalogMetalKey[] = ['gold', 'silver', 'diamond', 'gifting']

export function classifyCatalogMetalFamily(metalType: unknown): CatalogMetalKey | 'other' {
  const m = String(metalType ?? '')
    .trim()
    .toLowerCase()
  if (!m) return 'silver'
  if (m.startsWith('gifting') || m === 'gift' || m.startsWith('gift item')) return 'gifting'
  if (m.startsWith('diamond')) return 'diamond'
  if (m.startsWith('silver')) return 'silver'
  if (m.startsWith('gold')) return 'gold'
  if (m === '22k' || m === '18k' || m === '24k' || m === '916' || m === '750') return 'gold'
  return 'other'
}

export function productMatchesCatalogMetal(metalType: unknown, metalKey: CatalogMetalKey): boolean {
  const family = classifyCatalogMetalFamily(metalType)
  if (metalKey === 'gold') return family === 'gold'
  if (metalKey === 'silver') return family === 'silver' || family === 'other'
  if (metalKey === 'diamond') return family === 'diamond'
  if (metalKey === 'gifting') return family === 'gifting'
  return false
}

export type DiscountByMetal = Partial<Record<CatalogMetalKey, number>>

export function parseDiscountByMetal(raw: unknown): DiscountByMetal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: DiscountByMetal = {}
  for (const key of CATALOG_METAL_KEYS) {
    const v = (raw as Record<string, unknown>)[key]
    if (v == null || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) out[key] = Math.min(100, n)
  }
  return out
}

export function resolveCategoryDiscountForMetalTab(
  category: { discount_by_metal?: unknown; discount_percentage?: number },
  metalKey: CatalogMetalKey,
): number {
  const byMetal = parseDiscountByMetal(category.discount_by_metal)
  if (byMetal[metalKey] != null) return byMetal[metalKey]!
  const keys = Object.keys(byMetal)
  if (keys.length === 0) {
    const legacy = Number(category.discount_percentage ?? 0)
    return Number.isFinite(legacy) && legacy > 0 ? legacy : 0
  }
  return 0
}
