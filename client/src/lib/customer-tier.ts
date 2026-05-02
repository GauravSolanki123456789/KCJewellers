import type { WholesalePricingInput } from './pricing'
import { SUPER_ADMIN_EMAIL } from '@/lib/is-catalog-admin'

/**
 * Customer tier — consistent with PostgreSQL `users.customer_tier` and API `user.customer_tier`.
 */
export const CUSTOMER_TIER = {
  ADMIN: 'ADMIN',
  B2C_CUSTOMER: 'B2C_CUSTOMER',
  B2B_WHOLESALE: 'B2B_WHOLESALE',
  RESELLER: 'RESELLER',
} as const

export type CustomerTier = (typeof CUSTOMER_TIER)[keyof typeof CUSTOMER_TIER]

/** API user payload fields for wholesale pricing (matches `/api/auth/current_user`). */
export type WholesaleUserFields = {
  customer_tier?: string
  wholesale_making_charge_discount_percent?: number
  wholesale_markup_percent?: number
  allowed_category_ids?: number[] | null
  business_name?: string | null
  custom_domain?: string | null
  /** Saved from Admin B2B row — used for reseller storefront WhatsApp orders when set. */
  mobile_number?: string | null
}

export function normalizeCustomerTier(raw: string | undefined | null): CustomerTier {
  const u = String(raw || CUSTOMER_TIER.B2C_CUSTOMER).toUpperCase()
  if (
    u === CUSTOMER_TIER.ADMIN ||
    u === CUSTOMER_TIER.B2B_WHOLESALE ||
    u === CUSTOMER_TIER.RESELLER
  ) {
    return u as CustomerTier
  }
  return CUSTOMER_TIER.B2C_CUSTOMER
}

export function hasWholesaleCatalogAccess(
  user: (WholesaleUserFields & { email?: string | null }) | null | undefined,
): boolean {
  if (!user) return false
  const email = String(user.email || '').toLowerCase().trim()
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return true
  const tier = normalizeCustomerTier(user.customer_tier)
  return (
    tier === CUSTOMER_TIER.B2B_WHOLESALE ||
    tier === CUSTOMER_TIER.ADMIN ||
    tier === CUSTOMER_TIER.RESELLER
  )
}

/**
 * B2B wholesale portal: quick-order matrix, Khata ledger, NEFT / ledger checkout.
 * `RESELLER` keeps catalogue wholesale *pricing* via {@link hasWholesaleCatalogAccess} but must not use B2B portal routes.
 * Mirrors `services/authService.hasB2bWholesalePortalAccess` and `requireB2BWholesale`.
 */
export function hasB2bWholesalePortalAccess(
  user: (WholesaleUserFields & { email?: string | null }) | null | undefined,
): boolean {
  if (!user) return false
  const email = String(user.email || '').toLowerCase().trim()
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return true
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
