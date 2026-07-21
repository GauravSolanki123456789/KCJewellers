import type { SharedCatalogPickLineForWhatsApp } from '@/lib/cart-order-whatsapp'
import { formatSharedCatalogOrderWhatsAppBody } from '@/lib/cart-order-whatsapp'
import {
  formatStoredMobileDisplay,
  whatsAppDigitsFromStored,
} from '@/lib/international-mobile'

export type CatalogInquiryStatus = 'pending' | 'completed' | 'no_sale'

export type CatalogInquiryLine = {
  name?: string
  code?: string
  qty?: number
  unitInr?: number | null
  lineTotalInr?: number | null
  compareAtInr?: number | null
  sizeLabel?: string | null
  weightLabel?: string | null
  metalSpecSummary?: string | null
  showInclGst?: boolean
  withBoxPriceInr?: number | null
  slabDiscountLines?: string[]
  savingsInr?: number | null
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
  return formatStoredMobileDisplay(mobile)
}

export function customerWhatsAppHref(
  mobile: string | null | undefined,
  message?: string,
): string | null {
  const wa = whatsAppDigitsFromStored(mobile)
  if (!wa) return null
  const base = `https://wa.me/${wa}`
  if (!message?.trim()) return base
  return `${base}?text=${encodeURIComponent(message.trim())}`
}

export function inquiryLineToWhatsAppLine(line: CatalogInquiryLine): SharedCatalogPickLineForWhatsApp {
  return {
    name: line.name ?? 'Item',
    skuOrBarcode: line.code ?? '—',
    priceInr: Number(line.unitInr ?? 0) || 0,
    compareAtInr: line.compareAtInr ?? undefined,
    qty: line.qty ?? 1,
    sizeLabel: line.sizeLabel ?? undefined,
    weightLabel: line.weightLabel ?? undefined,
    metalSpecSummary: line.metalSpecSummary ?? undefined,
    showInclGst: line.showInclGst,
    withBoxPriceInr: line.withBoxPriceInr ?? undefined,
    slabDiscountLines: line.slabDiscountLines,
    savingsInr: line.savingsInr ?? undefined,
  }
}

export function buildCustomerFollowUpWhatsAppMessage(params: {
  brandLabel: string
  customerName?: string | null
  totalPieces: number
  lineCount: number
  totalInr: number | null
  lines?: CatalogInquiryLine[]
  catalogUrl?: string | null
  hidePrices?: boolean
}): string {
  const { brandLabel, customerName, totalPieces, lineCount, totalInr, lines, catalogUrl, hidePrices } =
    params
  const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hi,'
  const waLines = (lines ?? []).map(inquiryLineToWhatsAppLine)
  const hasRichLines = waLines.length > 0

  if (hasRichLines) {
    const orderBlock = formatSharedCatalogOrderWhatsAppBody({
      lines: waLines,
      totalPieces,
      lineCount,
      totalInr,
      catalogueUrl: catalogUrl ?? undefined,
      hidePrices: !!hidePrices,
      introLine: hidePrices
        ? 'Your shortlisted pieces (qty & weight on each line):'
        : 'Please find your order below — *quantities are highlighted* on every line:',
    })
    return `${greeting}\n\nThis is ${brandLabel}. We received your catalogue inquiry:\n\n${orderBlock}\n\nWould you like to proceed or need any changes? Thank you.`
  }

  const value =
    totalInr != null && Number.isFinite(totalInr)
      ? `₹${Math.round(totalInr).toLocaleString('en-IN')}`
      : 'your shortlist'
  let msg = `${greeting}\n\nThis is ${brandLabel}. We received your catalogue inquiry (${totalPieces} pc${totalPieces === 1 ? '' : 's'}, ${lineCount} line${lineCount === 1 ? '' : 's'}, ${value}).\n\nWould you like to proceed or need any changes?`
  if (catalogUrl?.trim()) {
    msg += `\n\nCatalogue:\n${catalogUrl.trim()}`
  }
  return msg
}
