import { JOIN_RESELLER_PATH } from '@/lib/routes'
import { getSiteUrl } from '@/lib/site'

/** Must match `normalizeResellerInviteCode` in server.js */
export function normalizeResellerInviteCode(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 50)
}

export function buildJoinResellerPath(code?: string | null): string {
  const normalized = code ? normalizeResellerInviteCode(code) : ''
  if (!normalized) return JOIN_RESELLER_PATH
  return `${JOIN_RESELLER_PATH}?code=${encodeURIComponent(normalized)}`
}

export function buildJoinResellerUrl(code?: string | null, origin?: string): string {
  const site = (origin ?? getSiteUrl()).replace(/\/$/, '')
  return `${site}${buildJoinResellerPath(code)}`
}

export type ResellerApplicationStatus = 'pending' | 'approved' | 'rejected'

export function resellerApplicationStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase()
  if (s === 'approved') return 'Approved'
  if (s === 'rejected') return 'Not approved'
  return 'Under review'
}

export function resellerApplicationStatusTone(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase()
  if (s === 'approved') return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
  if (s === 'rejected') return 'text-rose-400 bg-rose-500/15 border-rose-500/30'
  return 'text-amber-400 bg-amber-500/15 border-amber-500/30'
}

export function buildResellerInviteWhatsAppMessage(params: {
  inviteCode: string
  shareUrl: string
  businessName?: string | null
}): string {
  const brand = params.businessName?.trim() || 'KC Jewellers'
  const code = normalizeResellerInviteCode(params.inviteCode)
  return (
    `Join ${brand} as a white-label jewellery reseller on KC Jewellers!\n\n` +
    `Invite code: ${code}\n` +
    `Apply here: ${params.shareUrl}\n\n` +
    `Get your own branded catalogue to share with customers via WhatsApp & web links.`
  )
}
