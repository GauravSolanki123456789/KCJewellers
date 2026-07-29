import type { SharedCatalogPickLineForWhatsApp } from '@/lib/cart-order-whatsapp'
import { formatSharedCatalogOrderWhatsAppBody } from '@/lib/cart-order-whatsapp'
import {
  formatStoredMobileDisplay,
  normalizeStoredMobile,
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
  /** Uploaded MC slab rate (Slab C / Slab 2 etc.). */
  uploadedMcRate?: number | null
  uploadedMcType?: string | null
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
  /** Snapshotted from shared_catalogs.hide_prices when listing. */
  hide_prices?: boolean
  /** Per-reseller sequential inquiry number (1, 2, 3…). */
  reseller_inquiry_number?: number | null
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

/** Weight-only shared catalogue — no prices in UI, copy, WhatsApp, or PDF. */
export function inquiryIsWeightOnly(inquiry: Pick<CatalogInquiryRow, 'hide_prices' | 'total_inr'>): boolean {
  if (inquiry.hide_prices === true) return true
  return inquiry.total_inr == null
}

export function inquiryDisplayNumber(inquiry: Pick<CatalogInquiryRow, 'id' | 'reseller_inquiry_number'>): number {
  const seq = inquiry.reseller_inquiry_number
  if (seq != null && Number.isFinite(seq) && seq > 0) return Math.floor(seq)
  return inquiry.id
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

/** Trackable quotation PDF filename — per-reseller inquiry #, customer mobile, timestamp. */
export function buildInquiryQuotationPdfFilename(params: {
  inquiryId: number
  resellerInquiryNumber?: number | null
  customerName?: string | null
  customerMobile?: string | null
  createdAt?: string | null
  brandLabel?: string | null
}): string {
  const brand =
    String(params.brandLabel || 'quotation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'quotation'

  const nameSlug = String(params.customerName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)

  const mobile = normalizeStoredMobile(params.customerMobile)
  const mobilePart = mobile ? mobile.slice(-10) : 'unknown'

  const d = params.createdAt ? new Date(params.createdAt) : new Date()
  const datePart = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 10)
    : d.toISOString().slice(0, 10)
  const hh = Number.isNaN(d.getTime()) ? '00' : String(d.getHours()).padStart(2, '0')
  const mm = Number.isNaN(d.getTime()) ? '00' : String(d.getMinutes()).padStart(2, '0')

  const inqNum =
    params.resellerInquiryNumber != null &&
    Number.isFinite(params.resellerInquiryNumber) &&
    params.resellerInquiryNumber > 0
      ? Math.floor(params.resellerInquiryNumber)
      : params.inquiryId

  const parts = [`${brand}-inq${inqNum}`, mobilePart, datePart, `${hh}${mm}`]
  if (nameSlug && !/^customer-\d+$/i.test(nameSlug)) {
    parts.splice(1, 0, nameSlug)
  }
  return `${parts.join('-')}.pdf`
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
    uploadedMcRate: line.uploadedMcRate ?? undefined,
    uploadedMcType: line.uploadedMcType ?? undefined,
  }
}

/** Plain-text block for copying line items from an inquiry card. */
export function formatInquiryLinesCopyText(
  lines: CatalogInquiryLine[],
  opts?: { weightOnly?: boolean },
): string {
  const weightOnly = !!opts?.weightOnly
  return lines
    .map((line) => {
      const chunks: string[] = [line.name ?? 'Item', '']
      if (line.code?.trim()) {
        chunks.push(`Ref: ${line.code.trim()}`, '')
      }
      if (weightOnly) {
        if (line.weightLabel?.trim()) {
          chunks.push(line.weightLabel.trim(), '')
        }
        if (line.uploadedMcRate != null && Number.isFinite(line.uploadedMcRate)) {
          chunks.push(`MC: ${line.uploadedMcRate}`, '')
        }
        if (line.uploadedMcType?.trim()) {
          chunks.push(`MCTYPE: ${line.uploadedMcType.trim()}`, '')
        }
        chunks.push(`Qty ${line.qty ?? 1}`)
        return chunks.join('\n')
      }
      if (line.lineTotalInr != null && Number.isFinite(line.lineTotalInr)) {
        chunks.push(formatCatalogInr(line.lineTotalInr), '')
      }
      const qty = line.qty ?? 1
      const unitPart =
        line.unitInr != null && Number.isFinite(line.unitInr)
          ? ` × ${formatCatalogInr(line.unitInr)} incl. GST`
          : ''
      chunks.push(`Qty ${qty}${unitPart}`)
      return chunks.join('\n')
    })
    .join('\n\n')
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
