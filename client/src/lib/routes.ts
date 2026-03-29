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
export const SIP_PATH = '/sip'
