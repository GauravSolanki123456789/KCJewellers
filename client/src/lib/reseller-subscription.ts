/**
 * Reseller website/catalogue and ERP subscription windows.
 * Mirrors `services/resellerSubscription.js` for admin preview + UI copy.
 * Server `/api/auth/current_user` remains the source of truth for access.
 */

export const RESELLER_SUB_MODULES = ['website', 'erp'] as const
export type ResellerSubModule = (typeof RESELLER_SUB_MODULES)[number]

export type ResellerSubStatus =
  | 'open'
  | 'active'
  | 'trial'
  | 'trial_over'
  | 'expired'
  | 'not_started'

export type ResellerModuleAccess = {
  module: ResellerSubModule
  label: string
  from_date: string | null
  to_date: string | null
  trial_enabled: boolean
  trial_from_date: string | null
  trial_to_date: string | null
  status: ResellerSubStatus
  hasAccess: boolean
  configured: boolean
  days_left: number | null
  active_until: string | null
  headline: string
  detail: string
  public_headline: string
  public_detail: string
  blocked: boolean
}

export type ResellerSubscriptionFields = {
  reseller_website_from_date?: string | null
  reseller_website_to_date?: string | null
  reseller_website_trial_enabled?: boolean
  reseller_website_trial_from_date?: string | null
  reseller_website_trial_to_date?: string | null
  reseller_erp_from_date?: string | null
  reseller_erp_to_date?: string | null
  reseller_erp_trial_enabled?: boolean
  reseller_erp_trial_from_date?: string | null
  reseller_erp_trial_to_date?: string | null
  reseller_website_subscription?: ResellerModuleAccess | null
  reseller_erp_subscription?: ResellerModuleAccess | null
}

export const OPEN_WEBSITE_ACCESS: ResellerModuleAccess = {
  module: 'website',
  label: 'Website & catalogue',
  from_date: null,
  to_date: null,
  trial_enabled: false,
  trial_from_date: null,
  trial_to_date: null,
  status: 'open',
  hasAccess: true,
  configured: false,
  days_left: null,
  active_until: null,
  headline: 'Unlimited',
  detail: '',
  public_headline: '',
  public_detail: '',
  blocked: false,
}

export const OPEN_ERP_ACCESS: ResellerModuleAccess = {
  ...OPEN_WEBSITE_ACCESS,
  module: 'erp',
  label: 'ERP software',
}

export function ymdFromValue(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function todayIstYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addDaysYmd(ymd: string, days: number): string {
  const base = ymdFromValue(ymd) || todayIstYmd()
  const [y, mo, d] = base.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(Date.UTC(y, mo - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function daysBetweenYmd(from: string | null, to: string | null): string {
  const a = ymdFromValue(from)
  const b = ymdFromValue(to)
  if (!a || !b) return ''
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  if (!Number.isFinite(ms)) return ''
  return String(Math.round(ms / 86400000))
}

export function formatResellerDate(ymd: string | null | undefined): string {
  const v = ymdFromValue(ymd)
  if (!v) return ''
  const [y, mo, d] = v.split('-').map((n) => parseInt(n, 10))
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!y || !mo || !d) return v
  return `${d} ${months[mo - 1]} ${y}`
}

function inRange(today: string, from: string | null, to: string | null): boolean {
  if (!from || !to) return false
  return today >= from && today <= to
}

export function evaluateResellerModule(
  module: ResellerSubModule,
  dates: {
    paidFrom?: string | null
    paidTo?: string | null
    trialEnabled?: boolean
    trialFrom?: string | null
    trialTo?: string | null
  },
  today = todayIstYmd(),
): ResellerModuleAccess {
  const paidFrom = ymdFromValue(dates.paidFrom)
  const paidTo = ymdFromValue(dates.paidTo)
  const trialEnabled = !!dates.trialEnabled
  const trialFrom = ymdFromValue(dates.trialFrom)
  const trialTo = ymdFromValue(dates.trialTo)
  const label = module === 'erp' ? 'ERP software' : 'Website & catalogue'
  const paidConfigured = !!(paidFrom && paidTo)
  const trialConfigured = !!(trialEnabled && trialFrom && trialTo)
  const paidActive = paidConfigured && inRange(today, paidFrom, paidTo)
  const trialActive = trialConfigured && inRange(today, trialFrom, trialTo)

  let status: ResellerSubStatus = 'open'
  let hasAccess = true
  let daysLeft: number | null = null
  let activeUntil: string | null = null

  if (paidActive) {
    status = 'active'
    hasAccess = true
    daysLeft = Number(daysBetweenYmd(today, paidTo))
    activeUntil = paidTo
  } else if (trialActive) {
    status = 'trial'
    hasAccess = true
    daysLeft = Number(daysBetweenYmd(today, trialTo))
    activeUntil = trialTo
  } else if (!paidConfigured && !trialConfigured) {
    status = 'open'
    hasAccess = true
  } else if (paidConfigured && today > paidTo!) {
    status = 'expired'
    hasAccess = false
  } else if (trialConfigured && today > trialTo!) {
    status = 'trial_over'
    hasAccess = false
  } else if (paidConfigured && today < paidFrom!) {
    status = 'not_started'
    hasAccess = false
  } else if (trialConfigured && today < trialFrom!) {
    status = 'not_started'
    hasAccess = false
  }

  const headline =
    status === 'active'
      ? daysLeft === 0
        ? `Active — last day (${formatResellerDate(paidTo)})`
        : `Active — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
      : status === 'trial'
        ? daysLeft === 0
          ? `Free trial — last day (${formatResellerDate(trialTo)})`
          : `Free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`
        : status === 'trial_over'
          ? 'Free trial expired'
          : status === 'expired'
            ? 'Subscription expired'
            : status === 'not_started'
              ? `Starts ${formatResellerDate(paidFrom || trialFrom)}`
              : 'Unlimited'

  const detail = ''

  const public_headline =
    status === 'trial_over'
      ? 'Free trial expired'
      : status === 'expired'
        ? 'Subscription expired'
        : status === 'not_started'
          ? 'Catalogue unavailable'
          : ''

  const public_detail = ''

  return {
    module,
    label,
    from_date: paidFrom,
    to_date: paidTo,
    trial_enabled: trialEnabled,
    trial_from_date: trialFrom,
    trial_to_date: trialTo,
    status,
    hasAccess,
    configured: paidConfigured || trialConfigured,
    days_left: Number.isFinite(daysLeft as number) ? daysLeft : null,
    active_until: activeUntil,
    headline,
    detail,
    public_headline,
    public_detail,
    blocked: !hasAccess,
  }
}

export function isResellerModuleBlocked(
  access: { hasAccess?: boolean } | null | undefined,
): boolean {
  return !!access && access.hasAccess === false
}

/** Short label for banners and profile cards when access is blocked. */
export function resellerSubscriptionBlockedLabel(
  access:
    | Pick<ResellerModuleAccess, 'status' | 'headline' | 'hasAccess'>
    | { status?: ResellerSubStatus | string; headline?: string; hasAccess?: boolean }
    | null
    | undefined,
): string {
  if (!access) return ''
  const blocked =
    access.hasAccess === false ||
    access.status === 'trial_over' ||
    access.status === 'expired' ||
    access.status === 'not_started'
  if (!blocked) return ''
  if (access.status === 'trial_over') return 'Free trial expired'
  if (access.status === 'expired') return 'Subscription expired'
  if (access.status === 'not_started') return access.headline || 'Not started'
  return access.headline || 'Expired'
}

export function resellerStatusTone(status: ResellerSubStatus): {
  wrap: string
  text: string
} {
  if (status === 'active' || status === 'trial') {
    return {
      wrap: 'border-emerald-700/25 bg-emerald-50',
      text: 'text-emerald-800',
    }
  }
  if (status === 'expired' || status === 'trial_over') {
    return {
      wrap: 'border-rose-700/25 bg-rose-50',
      text: 'text-rose-800',
    }
  }
  if (status === 'not_started') {
    return {
      wrap: 'border-amber-700/25 bg-amber-50',
      text: 'text-amber-900',
    }
  }
  return {
    wrap: 'border-slate-700 bg-slate-900/40',
    text: 'text-slate-200',
  }
}
