/**
 * Reseller attention keys — stored in `admin_attention_section_seen` (same table as admin).
 * Must match KC_RESELLER_ATTENTION_SECTION_KEYS in server.js.
 */
import { RESELLER_INQUIRIES_PATH } from '@/lib/routes'

export const RESELLER_ATTENTION_SECTION_KEY = {
  own_catalog_inquiries: 'own_catalog_inquiries',
} as const

export type ResellerAttentionSectionKey =
  (typeof RESELLER_ATTENTION_SECTION_KEY)[keyof typeof RESELLER_ATTENTION_SECTION_KEY]

export function getResellerAttentionSectionKeyFromPathname(
  pathname: string | null,
): ResellerAttentionSectionKey | null {
  if (!pathname) return null
  if (pathname.startsWith(RESELLER_INQUIRIES_PATH)) {
    return RESELLER_ATTENTION_SECTION_KEY.own_catalog_inquiries
  }
  return null
}
