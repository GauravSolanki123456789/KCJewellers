import { pdf } from '@react-pdf/renderer'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import { ErpQuotePdfDocument } from '@/lib/erp-quote-pdf-document'
import { resolveItemsForPdf } from '@/lib/pdf-embed-images'
import type { PdfShareSheetPayload } from '@/lib/pdf-share'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'
import {
  buildErpQuotePdfFilename,
  billRatesUnfixed,
  computeErpQuoteTotals,
  erpCustomerWhatsAppHref,
  erpLinesToPdfItems,
  resolveErpLineImages,
} from '@/lib/erp-quote-pdf'
import { formatErpInr } from '@/lib/reseller-erp-modules'

export function buildErpSalesWhatsAppMessage(params: {
  brandLabel: string
  bill: ErpBill
  customerName?: string | null
  filename: string
}): string {
  const { brandLabel, bill, customerName, filename } = params
  const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hi,'
  const lines = bill.lines ?? []
  const itemLines = lines
    .map((l, i) => {
      const amt = l.lineTotalInr != null ? formatErpInr(l.lineTotalInr) : '—'
      const wt = l.weightGm != null ? ` · ${l.weightGm} gm` : ''
      return `${i + 1}. ${l.name}${wt} — ${amt}`
    })
    .join('\n')
  return `${greeting}\n\nYour tax invoice *${bill.bill_number}* from ${brandLabel} is attached (${filename}).\n\n${itemLines}\n\n*Net total (incl. GST):* ${formatErpInr(bill.total_inr)}\n\nThank you for your purchase!`
}

export async function buildErpSalesPdfPayload(params: {
  bill: ErpBill
  brandLabel: string
  customerName?: string | null
  mobile?: string | null
  kcThemeId?: string | null
  slabSettingsRaw?: unknown
  gstin?: string | null
}): Promise<PdfShareSheetPayload> {
  const lines = params.bill.lines ?? []
  if (!lines.length) {
    throw new Error('No line items on this bill.')
  }

  const linesWithImages = await resolveErpLineImages(lines)
  const billForPdf = { ...params.bill, lines: linesWithImages }
  const itemsForPdf = await resolveItemsForPdf(erpLinesToPdfItems(linesWithImages))
  const brandLabel = params.brandLabel.trim() || 'Our store'
  const kcThemeId = normalizeKcThemeId(params.kcThemeId ?? null)
  const totals = computeErpQuoteTotals(billForPdf, params.slabSettingsRaw)
  const ratesUnfixed = billRatesUnfixed(billForPdf)

  const blob = await pdf(
    <ErpQuotePdfDocument
      bill={billForPdf}
      brandName={brandLabel}
      kcThemeId={kcThemeId}
      products={itemsForPdf}
      totals={totals}
      customerName={params.customerName ?? params.bill.customer_name}
      ratesUnfixed={ratesUnfixed}
      documentKind="invoice"
      gstin={params.gstin ?? null}
    />,
  ).toBlob()

  const filename = buildErpQuotePdfFilename({
    billNumber: params.bill.bill_number,
    customerName: params.customerName ?? params.bill.customer_name,
    createdAt: params.bill.created_at ?? null,
  }).replace(/quote/i, 'invoice')

  const text = buildErpSalesWhatsAppMessage({
    brandLabel,
    bill: params.bill,
    customerName: params.customerName ?? params.bill.customer_name,
    filename,
  })

  return {
    blob,
    filename,
    title: `${brandLabel} — Invoice ${params.bill.bill_number}`,
    text,
    fallbackWhatsAppText: text,
    fallbackWhatsAppHref: erpCustomerWhatsAppHref(params.mobile, text),
    brandLabel,
  }
}
