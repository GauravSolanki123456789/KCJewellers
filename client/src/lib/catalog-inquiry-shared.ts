export type CatalogInquiryStatus = 'pending' | 'completed' | 'no_sale'

export type CatalogInquiryLine = {
  name?: string
  code?: string
  qty?: number
  unitInr?: number | null
  lineTotalInr?: number | null
}

export type CatalogInquiryRow = {
  id: number
  shared_catalog_id: string | null
  reseller_user_id: number | null
  source: string
  line_count: number
  total_pieces: number
  total_inr: number | null
  catalog_url: string | null
  created_at: string
  inquiry_status?: CatalogInquiryStatus
  status_updated_at?: string | null
  status_note?: string | null
  reseller_label?: string | null
  reseller_domain?: string | null
  lines?: CatalogInquiryLine[]
}

export const CATALOG_INQUIRY_PERIOD_OPTIONS = [
  { value: 'today', label: 'Today (IST)' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const

export type CatalogInquiryPeriod = (typeof CATALOG_INQUIRY_PERIOD_OPTIONS)[number]['value']

export function formatCatalogInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function formatCatalogWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function catalogInquirySourceLabel(source: string): string {
  const s = source.toLowerCase()
  if (s === 'pdf') return 'PDF'
  if (s === 'whatsapp') return 'WhatsApp'
  return source
}

export function catalogInquiryStatusMeta(status: CatalogInquiryStatus | string | undefined): {
  label: string
  className: string
} {
  const s = String(status || 'pending').toLowerCase()
  if (s === 'completed') {
    return {
      label: 'Sale completed',
      className:
        'border-emerald-300/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    }
  }
  if (s === 'no_sale') {
    return {
      label: 'No sale',
      className: 'border-slate-400/40 bg-slate-500/10 text-slate-500',
    }
  }
  return {
    label: 'Pending',
    className: 'border-amber-400/50 bg-amber-500/15 text-amber-800 dark:text-amber-300',
  }
}

export function countsTowardQuotedTotal(status: CatalogInquiryStatus | string | undefined): boolean {
  const s = String(status || 'pending').toLowerCase()
  return s === 'pending' || s === 'completed'
}
