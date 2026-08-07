import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { billRatesUnfixed } from '@/lib/erp-quote-pdf'

export const ESTIMATE_STATUSES = ['draft', 'rate_unfix', 'advance_paid', 'cancelled'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

/** Filter-only values (not manually set on estimates). */
export const ESTIMATE_FILTER_STATUSES = [...ESTIMATE_STATUSES, 'billed', 'unbilled'] as const
export type EstimateFilterStatus = (typeof ESTIMATE_FILTER_STATUSES)[number]

export function isEstimateBilled(bill: ErpBill): boolean {
  return String(bill.status || '').toLowerCase() === 'billed'
}

export function formatEstimateStatusLabel(status: string): string {
  const s = String(status || 'draft').toLowerCase()
  if (s === 'billed') return 'Billed'
  if (s === 'unbilled') return 'Unbilled'
  if (s === 'rate_unfix') return 'Rate Unfix'
  if (s === 'advance_paid') return 'Advance paid'
  if (s === 'cancelled') return 'Cancelled'
  return 'Draft'
}

export function estimateStatusBadgeClass(status: string): string {
  const s = String(status || 'draft').toLowerCase()
  if (s === 'billed') return 'border-emerald-300 bg-emerald-100 text-emerald-950'
  if (s === 'rate_unfix') return 'border-orange-200 bg-orange-50 text-orange-900'
  if (s === 'advance_paid') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (s === 'cancelled') return 'border-slate-300 bg-slate-100 text-slate-600'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

/** Effective status for display / filters (handles legacy rows saved as draft). */
export function resolveBillEstimateStatus(bill: ErpBill): EstimateStatus | 'billed' {
  const stored = String(bill.status || 'draft').toLowerCase()
  if (stored === 'billed') return 'billed'
  if (stored === 'cancelled') return 'cancelled'
  if (stored === 'rate_unfix' || stored === 'advance_paid') return stored as EstimateStatus
  if (billRatesUnfixed(bill)) return 'rate_unfix'
  const session = bill.session as ErpBillSession | undefined
  const advance = Number(session?.advancePaidInr) || 0
  if (advance > 0) return 'advance_paid'
  return 'draft'
}

export function deriveEstimateStatus(input: {
  lines: ErpBillLine[]
  advancePaidInr?: number | null
  keepCancelled?: boolean
  currentStatus?: string | null
}): EstimateStatus {
  const current = String(input.currentStatus || '').toLowerCase()
  if (input.keepCancelled && current === 'cancelled') return 'cancelled'
  const advance = Math.max(0, Number(input.advancePaidInr) || 0)
  if (advance > 0) return 'advance_paid'
  const ratesUnfixed = input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  if (ratesUnfixed) return 'rate_unfix'
  return 'draft'
}
