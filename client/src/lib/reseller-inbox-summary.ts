/**
 * Reseller inbox — shapes match `GET /api/reseller/inbox-summary` (server.js).
 */
import { formatAdminInboxBadge } from '@/lib/admin-inbox-summary'
import { RESELLER_INQUIRIES_PATH, PROFILE_PATH } from '@/lib/routes'

export const KC_RESELLER_INBOX_REFRESH_EVENT = 'kc-reseller-inbox-refresh'

export type ResellerInboxCounts = {
  catalogInquiriesPending: number
}

export type ResellerBadgesByHref = Partial<Record<string, number>>

export type ResellerInboxSummaryData = {
  counts: ResellerInboxCounts
  badgesByHref: ResellerBadgesByHref
  /** Unread-style count for profile / nav badge (since last mark-seen). */
  navAttentionCount: number
  generatedAt: string
}

export { formatAdminInboxBadge as formatResellerInboxBadge }

export const RESELLER_INBOX_PROFILE_PATHS = [PROFILE_PATH, RESELLER_INQUIRIES_PATH] as const
