/**
 * Admin inbox / attention summary — shapes must match `GET /api/admin/inbox-summary` (`server.js`).
 *
 * - `counts` / `totalAttentionCount`: operational workload (full queue).
 * - `badgesByHref` / `navAttentionCount`: unread-style counts since last `POST /api/admin/attention/mark-seen`
 *   for each `attentionSectionKey`.
 */
export const KC_ADMIN_INBOX_REFRESH_EVENT = 'kc-admin-inbox-refresh'

export type AdminInboxCounts = {
  retailOrdersPaymentPending: number
  retailOrdersRecentFulfillment: number
  b2bOrdersPendingApproval: number
  sipPayoutsPending: number
  rateBookingsRecentBooked: number
  newCustomersLast7Days: number
  customerActivityEvents24h: number
}

export type AdminInboxInsights = {
  newSignupsLast7Days: number
  hasVisitorActivity24h: boolean
}

/** Per-route unread badge counts (paths like `/admin/orders`). */
export type AdminBadgesByHref = Partial<Record<string, number>>

/** Mirrors `attention_section_key` in DB and `attentionSectionKey` in mark-seen API. */
export type AdminUnreadCountsByAttentionSectionKey = {
  retail_orders: number
  b2b_purchase_orders: number
  sip_payouts: number
  rate_bookings: number
  customer_insights: number
}

export type AdminInboxSummaryData = {
  counts: AdminInboxCounts
  insights: AdminInboxInsights
  badgesByHref: AdminBadgesByHref
  /** Operational queue size (orders, B2B, payouts, recent bookings) — not insights. */
  totalAttentionCount: number
  /** Sum of unread `badgesByHref` (capped server-side). Shown on profile / nav. */
  navAttentionCount: number
  unreadCountsByAttentionSectionKey?: AdminUnreadCountsByAttentionSectionKey
  generatedAt: string
}

export function formatAdminInboxBadge(count: number): string {
  if (!count || count <= 0) return ''
  if (count > 99) return '99+'
  return String(count)
}
