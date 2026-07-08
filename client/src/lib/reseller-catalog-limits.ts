import type { WholesaleUserFields } from '@/lib/customer-tier'
import { isCatalogAdminUser } from '@/lib/is-catalog-admin'

export const PLATFORM_CATALOG_MAX_PRODUCTS = 500
export const DEFAULT_CATALOG_MAX_PRODUCTS = 50
export const DEFAULT_CATALOG_DAILY_LIMIT = 10

export type ResellerCatalogLimits = {
  maxProducts: number
  dailyLimit: number
  maxProductsUnlimited: boolean
  dailyLimitUnlimited: boolean
  generationsToday: number
  generationsRemaining: number | null
  canGenerate: boolean
  platformMaxProducts: number
}

export function catalogLimitsFromUser(
  user: WholesaleUserFields | null | undefined,
  isAdminCatalog = false,
): ResellerCatalogLimits {
  if (isAdminCatalog) {
    return {
      maxProducts: 0,
      dailyLimit: 0,
      maxProductsUnlimited: true,
      dailyLimitUnlimited: true,
      generationsToday: 0,
      generationsRemaining: null,
      canGenerate: true,
      platformMaxProducts: PLATFORM_CATALOG_MAX_PRODUCTS,
    }
  }
  const rawMax = user?.reseller_catalog_max_products
  const rawDaily = user?.reseller_catalog_daily_limit
  const maxProducts =
    rawMax == null || rawMax === undefined
      ? DEFAULT_CATALOG_MAX_PRODUCTS
      : Math.max(0, Math.min(PLATFORM_CATALOG_MAX_PRODUCTS, Number(rawMax) || 0))
  const dailyLimit =
    rawDaily == null || rawDaily === undefined
      ? DEFAULT_CATALOG_DAILY_LIMIT
      : Math.max(0, Math.min(1000, Number(rawDaily) || 0))
  const generationsToday = Number(user?.reseller_catalog_generations_today ?? 0) || 0
  const generationsRemaining =
    user?.reseller_catalog_generations_remaining != null
      ? Number(user.reseller_catalog_generations_remaining)
      : dailyLimit === 0
        ? null
        : Math.max(0, dailyLimit - generationsToday)
  const canGenerate =
    user?.reseller_catalog_can_generate != null
      ? !!user.reseller_catalog_can_generate
      : dailyLimit === 0 || (generationsRemaining ?? 0) > 0
  return {
    maxProducts,
    dailyLimit,
    maxProductsUnlimited: maxProducts === 0,
    dailyLimitUnlimited: dailyLimit === 0,
    generationsToday,
    generationsRemaining,
    canGenerate,
    platformMaxProducts: PLATFORM_CATALOG_MAX_PRODUCTS,
  }
}

export function effectiveMaxSelectableProducts(limits: ResellerCatalogLimits): number | null {
  if (limits.maxProductsUnlimited) return limits.platformMaxProducts
  return limits.maxProducts
}

export function capProductIdSelection(ids: string[], max: number | null): string[] {
  const unique = [...new Set(ids.map(String).filter(Boolean))]
  if (max == null || max <= 0) return unique.slice(0, PLATFORM_CATALOG_MAX_PRODUCTS)
  return unique.slice(0, max)
}

export function catalogLimitsForAuthUser(user: unknown): ResellerCatalogLimits {
  return catalogLimitsFromUser(user as WholesaleUserFields, isCatalogAdminUser(user))
}
