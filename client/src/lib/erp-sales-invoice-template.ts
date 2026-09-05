/** Editable A4 tax invoice template (Marlecha-style delivery challan). */

export type ErpSalesInvoiceTemplateConfig = {
  /** Three copy labels — one per A4 page. */
  copyLabels: [string, string, string]
  documentTitle: string
  terms: string[]
  electronicRefLabel: string
  minTableRows: number
  /** Uploaded sample image/PDF URL for reference (not auto-OCR). */
  referenceFileUrl?: string | null
  referenceFileName?: string | null
}

export const DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE: ErpSalesInvoiceTemplateConfig = {
  copyLabels: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'],
  documentTitle: 'TAX INVOICE CUM DELIVERY CHALLAN',
  terms: [
    'Delivery after testing the goods at the time of purchase.',
    'Interest @ 24% P.A. will be charged if payment is not made within the stipulated time.',
    'We are not responsible for any loss or damage during transit.',
    'All disputes are subject to Chennai jurisdiction only.',
  ],
  electronicRefLabel: 'Electronic Ref No :',
  minTableRows: 12,
  referenceFileUrl: null,
  referenceFileName: null,
}

export function normalizeSalesInvoiceTemplate(raw: unknown): ErpSalesInvoiceTemplateConfig {
  const base = DEFAULT_MARLECHA_SALES_INVOICE_TEMPLATE
  if (!raw || typeof raw !== 'object') return { ...base }
  const o = raw as Record<string, unknown>
  const labels = Array.isArray(o.copyLabels)
    ? o.copyLabels.map((x) => String(x).trim()).filter(Boolean)
    : []
  const copyLabels: [string, string, string] = [
    labels[0] || base.copyLabels[0],
    labels[1] || base.copyLabels[1],
    labels[2] || base.copyLabels[2],
  ]
  const terms = Array.isArray(o.terms)
    ? o.terms.map((x) => String(x).trim()).filter(Boolean)
    : base.terms
  const minTableRows = Number(o.minTableRows)
  return {
    copyLabels,
    documentTitle: String(o.documentTitle || base.documentTitle).trim() || base.documentTitle,
    terms: terms.length ? terms : base.terms,
    electronicRefLabel: String(o.electronicRefLabel || base.electronicRefLabel).trim() || base.electronicRefLabel,
    minTableRows: Number.isFinite(minTableRows) && minTableRows >= 4 ? Math.min(24, minTableRows) : base.minTableRows,
    referenceFileUrl: o.referenceFileUrl != null ? String(o.referenceFileUrl) : null,
    referenceFileName: o.referenceFileName != null ? String(o.referenceFileName) : null,
  }
}

/** Per-bill overrides stored in session.invoicePrintOverrides */
export type ErpInvoicePrintOverrides = Partial<ErpSalesInvoiceTemplateConfig> & {
  /** Free-form notes appended above terms (all pages). */
  footerNote?: string
}

export function mergeInvoiceTemplate(
  settingsTemplate: unknown,
  overrides?: ErpInvoicePrintOverrides | null,
): ErpSalesInvoiceTemplateConfig {
  const base = normalizeSalesInvoiceTemplate(settingsTemplate)
  if (!overrides) return base
  const merged = normalizeSalesInvoiceTemplate({ ...base, ...overrides })
  if (overrides.copyLabels?.length) {
    const bl = merged.copyLabels
    merged.copyLabels = [
      overrides.copyLabels[0]?.trim() || bl[0],
      overrides.copyLabels[1]?.trim() || bl[1],
      overrides.copyLabels[2]?.trim() || bl[2],
    ]
  }
  if (overrides.terms?.length) merged.terms = overrides.terms
  return merged
}

export function buildErpSalesPdfFilename(billNumber: string, taxInvoiceMode?: boolean): string {
  const num = String(billNumber || 'invoice')
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (taxInvoiceMode) return `${num || 'invoice'}-e-invoice.pdf`
  return `${num || 'invoice'}.pdf`
}
