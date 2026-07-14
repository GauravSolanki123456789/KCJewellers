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
  customer_user_id?: number | null
  customer_mobile?: string | null
  customer_name?: string | null
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

export function formatCustomerMobileDisplay(mobile: string | null | undefined): string | null {
  const d = String(mobile ?? '').replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return null
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
}

export function customerWhatsAppHref(
  mobile: string | null | undefined,
  message?: string,
): string | null {
  const d = String(mobile ?? '').replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return null
  const base = `https://wa.me/91${d}`
  if (!message?.trim()) return base
  return `${base}?text=${encodeURIComponent(message.trim())}`
}

export function buildCustomerFollowUpWhatsAppMessage(params: {
  brandLabel: string
  customerName?: string | null
  totalPieces: number
  totalInr: number | null
  catalogUrl?: string | null
}): string {
  const { brandLabel, customerName, totalPieces, totalInr, catalogUrl } = params
  const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hi,'
  const value =
    totalInr != null && Number.isFinite(totalInr)
      ? `₹${Math.round(totalInr).toLocaleString('en-IN')}`
      : 'your shortlist'
  let msg = `${greeting}\n\nThis is ${brandLabel}. We received your catalogue inquiry (${totalPieces} pc${totalPieces === 1 ? '' : 's'}, ${value}).\n\nWould you like to proceed or need any changes?`
  if (catalogUrl?.trim()) {
    msg += `\n\nCatalogue:\n${catalogUrl.trim()}`
  }
  return msg
}
