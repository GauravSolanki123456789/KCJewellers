import type { WholesalePricingInput } from './pricing'

/**
 * Customer tier — consistent with PostgreSQL `users.customer_tier` and API `user.customer_tier`.
 */
export const CUSTOMER_TIER = {
  ADMIN: 'ADMIN',
  B2C_CUSTOMER: 'B2C_CUSTOMER',
  B2B_WHOLESALE: 'B2B_WHOLESALE',
} as const

export type CustomerTier = (typeof CUSTOMER_TIER)[keyof typeof CUSTOMER_TIER]

/** API user payload fields for wholesale pricing (matches `/api/auth/current_user`). */
export type WholesaleUserFields = {
  customer_tier?: string
  wholesale_making_charge_discount_percent?: number
  wholesale_markup_percent?: number
}

export function normalizeCustomerTier(raw: string | undefined | null): CustomerTier {
  const u = String(raw || CUSTOMER_TIER.B2C_CUSTOMER).toUpperCase()
  if (u === CUSTOMER_TIER.ADMIN || u === CUSTOMER_TIER.B2B_WHOLESALE) return u as CustomerTier
  return CUSTOMER_TIER.B2C_CUSTOMER
}

export function hasWholesaleCatalogAccess(user: WholesaleUserFields | null | undefined): boolean {
  if (!user) return false
  const tier = normalizeCustomerTier(user.customer_tier)
  return tier === CUSTOMER_TIER.B2B_WHOLESALE || tier === CUSTOMER_TIER.ADMIN
}

export function buildWholesalePricingInput(
  user: WholesaleUserFields | null | undefined,
): WholesalePricingInput | null {
  if (!user || !hasWholesaleCatalogAccess(user)) return null
  return {
    wholesale_making_charge_discount_percent: Number(user.wholesale_making_charge_discount_percent ?? 0),
    wholesale_markup_percent: Number(user.wholesale_markup_percent ?? 0),
  }
}
