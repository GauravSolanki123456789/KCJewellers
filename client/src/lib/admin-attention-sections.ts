/**
 * Canonical `attentionSectionKey` values — must match:
 * - DB: admin_attention_section_seen.attention_section_key
 * - API: POST /api/admin/attention/mark-seen body.attentionSectionKey
 * - Server: KC_ADMIN_ATTENTION_SECTION_KEYS (server.js)
 */
export const ADMIN_ATTENTION_SECTION_KEY = {
  retail_orders: 'retail_orders',
  b2b_purchase_orders: 'b2b_purchase_orders',
  sip_payouts: 'sip_payouts',
  rate_bookings: 'rate_bookings',
  customer_insights: 'customer_insights',
} as const

export type AdminAttentionSectionKey =
  (typeof ADMIN_ATTENTION_SECTION_KEY)[keyof typeof ADMIN_ATTENTION_SECTION_KEY]

/** When pathname matches an admin subsection, we mark that section seen (badges clear until new activity). */
export function getAdminAttentionSectionKeyFromPathname(pathname: string | null): AdminAttentionSectionKey | null {
  if (!pathname || !pathname.startsWith('/admin')) return null
  if (pathname.startsWith('/admin/orders/b2b')) return ADMIN_ATTENTION_SECTION_KEY.b2b_purchase_orders
  if (pathname.startsWith('/admin/orders')) return ADMIN_ATTENTION_SECTION_KEY.retail_orders
  if (pathname.startsWith('/admin/sip/payouts')) return ADMIN_ATTENTION_SECTION_KEY.sip_payouts
  if (pathname.startsWith('/admin/bookings')) return ADMIN_ATTENTION_SECTION_KEY.rate_bookings
  if (pathname.startsWith('/admin/insights')) return ADMIN_ATTENTION_SECTION_KEY.customer_insights
  return null
}
