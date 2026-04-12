/**
 * Shared route constants for KC Jewellers app.
 * Use these across the frontend and backend for consistency.
 */
export const CATALOG_PATH = '/catalog'
/** Live bullion rates + book-rate flow (single “Live Rates” destination). */
export const RATES_PATH = '/rates'
/** Alias for clarity in UI copy and analytics. */
export const LIVE_RATES_PATH = RATES_PATH
/** Default post-login / logout redirect — storefront catalogue. */
export const HOME_PATH = CATALOG_PATH
export const CATALOG_SCROLL_TO_KEY = 'kc_catalog_scroll_to'
/** Session snapshot for catalogue filters (metal, style, sku, sliders). */
export const CATALOG_STATE_KEY = 'kc_catalog_state'
/** Set when opening a product from the catalogue so "Back" can restore metal/style. */
export const CATALOG_FROM_PRODUCT_KEY = 'kc_catalog_from_product'
export const CHECKOUT_PATH = '/checkout'
export const PROFILE_PATH = '/profile'
export const PROFILE_SIPS_PATH = '/profile/sips'
/** B2B wholesale quick order matrix (requires `customer_tier` B2B / ADMIN). */
export const WHOLESALE_ORDER_PATH = '/wholesale-order'
/** B2B client ledger (Khata) — rupee + fine metal balances. */
export const PROFILE_LEDGER_PATH = '/profile/ledger'
export const SIP_PATH = '/sip'

/** Client-only: localStorage key for cart JSON (`cart.v1` schema). */
export const CART_LOCAL_STORAGE_KEY = 'cart.v1' as const

export const POLICY_TERMS_PATH = '/policies/terms'
export const POLICY_PRIVACY_PATH = '/policies/privacy'
export const POLICY_REFUNDS_PATH = '/policies/refunds'
export const POLICY_SHIPPING_PATH = '/policies/shipping'
