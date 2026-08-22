/**
 * Shared route constants for KC Jewellers app.
 * Use these across the frontend and backend for consistency.
 */
export const CATALOG_PATH = '/catalog'
/** Global search results page (`?q=`). */
export const SEARCH_PATH = '/search'
/** Today bullion rates + book-rate flow (single “Today Rates” destination). */
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
/** B2B wholesale PO success + proforma (after NEFT / ledger checkout). */
export const CHECKOUT_B2B_SUCCESS_PATH = '/checkout/b2b-success'
export const PROFILE_PATH = '/profile'
export const PROFILE_SIPS_PATH = '/profile/sips'
/** B2B wholesale quick order matrix (requires `customer_tier` B2B / ADMIN). */
export const WHOLESALE_ORDER_PATH = '/wholesale-order'
/** B2B client ledger (Khata) — rupee + fine metal balances. */
export const PROFILE_LEDGER_PATH = '/profile/ledger'
export const SIP_PATH = '/sip'
/** Public reseller onboarding — apply with admin-assigned `reseller_invite_code`. */
export const JOIN_RESELLER_PATH = '/join-reseller'
/** RESELLER tier — staff upload products + front/back photos (same fields as ERP sync). */
export const RESELLER_PRODUCTS_PATH = '/reseller/products'
/** RESELLER tier — staff update silver + gold live rates (per custom domain storefront). */
export const RESELLER_RATES_PATH = '/reseller/rates'
/** RESELLER tier — WhatsApp/PDF shortlist inquiries from shared catalogues. */
export const RESELLER_INQUIRIES_PATH = '/reseller/inquiries'
/** RESELLER tier — SMS / OTP for shared catalogue customer sign-in. */
export const RESELLER_SMS_SETTINGS_PATH = '/reseller/sms-settings'
/** RESELLER tier — upload weight-range MC slab Excel for WhatsApp catalogues. */
export const RESELLER_MC_SLABS_PATH = '/reseller/mc-slabs'
/** RESELLER tier — jewellery ERP hub (billing, CRM, stock, GST, reports…). */
export const RESELLER_ERP_PATH = '/reseller/erp'
/** RESELLER tier — DigiGold / DigiSilver schemes & customer savings (Profile tab). */
export const PROFILE_DIGI_PATH = '/profile/digi'
/** RESELLER tier — Razorpay keys for DigiGold / DigiSilver. */
export const RESELLER_PAYMENT_SETTINGS_PATH = '/reseller/payment-settings'
/** RESELLER tier — Slab R / W / F defaults for WhatsApp catalogues + storefront margin. */
export const RESELLER_CATALOG_SLAB_SETTINGS_PATH = '/reseller/catalog-slab-settings'
/** RESELLER tier — AI Enhanced Picture studio (idol templates etc.). */
export const RESELLER_ENHANCED_PICTURES_PATH = '/reseller/enhanced-pictures'
/** RESELLER tier — B2B pricelist (separate from live catalogue). */
export const RESELLER_PRICELIST_PATH = '/reseller/pricelist'
/** Admin — test & activate Enhanced Picture prompts for a reseller. */
export const ADMIN_ENHANCED_PICTURES_PATH = '/admin/enhanced-pictures'
/** Public — customer DigiGold purchase. */
export const DIGI_GOLD_PATH = '/digi/gold'
/** Public — customer DigiSilver purchase. */
export const DIGI_SILVER_PATH = '/digi/silver'

/** Client-only: localStorage key for cart JSON (`cart.v1` schema). */
export const CART_LOCAL_STORAGE_KEY = 'cart.v1' as const

export const POLICY_TERMS_PATH = '/policies/terms'
export const POLICY_PRIVACY_PATH = '/policies/privacy'
export const POLICY_REFUNDS_PATH = '/policies/refunds'
export const POLICY_SHIPPING_PATH = '/policies/shipping'
