import { pdf } from '@react-pdf/renderer'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import { ErpTaxInvoicePdfDocument, type ErpTaxInvoiceCompliance } from '@/lib/erp-tax-invoice-pdf-document'
import { ErpConfigurableTaxInvoicePdfDocument } from '@/lib/erp-marlecha-invoice-pdf'
import type { PdfShareSheetPayload } from '@/lib/pdf-share'
import { computeErpQuoteTotals, erpCustomerWhatsAppHref } from '@/lib/erp-quote-pdf'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { loadErpSettingsBundle, resolveEinvoiceQrImageSrc } from '@/lib/erp-invoice-settings'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { buildErpSalesPdfFilename } from '@/lib/erp-sales-invoice-template'
import { normalizeTaxInvoiceTemplate } from '@/lib/erp-tax-invoice-template'
import { mrpInvoiceItemNames, fetchGstInvoiceItems } from '@/components/reseller/erp/ErpGstInvoiceItemsPanel'

function normalizeMobileDigits(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(-10)
}

export function buildErpSalesWhatsAppMessage(params: {
  brandLabel: string
  bill: ErpBill
  customerName?: string | null
  filename: string
  isTaxInvoice?: boolean
}): string {
  const { brandLabel, bill, customerName, filename, isTaxInvoice } = params
  const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hi,'
  const lines = bill.lines ?? []
  const itemLines = lines
    .map((l, i) => {
      const amt = l.lineTotalInr != null ? formatErpInr(l.lineTotalInr) : '—'
      const wt = l.weightGm != null ? ` · ${l.weightGm} gm` : ''
      return `${i + 1}. ${l.invoice_item_name || l.name}${wt} — ${amt}`
    })
    .join('\n')
  const docLabel = isTaxInvoice ? 'tax invoice (e-invoice)' : 'tax invoice'
  const irn = bill.compliance?.einvoice?.irn
  const irnLine = irn ? `\n*IRN:* ${irn}` : ''
  return `${greeting}\n\nYour ${docLabel} *${bill.bill_number}* from ${brandLabel} is attached (${filename}).${irnLine}\n\n${itemLines}\n\n*Net total (incl. GST):* ${formatErpInr(bill.total_inr)}\n\nThank you for your purchase!`
}

export async function buildErpSalesPdfPayload(params: {
  bill: ErpBill
  brandLabel: string
  customerName?: string | null
  mobile?: string | null
  customerAddress?: string | null
  customerPan?: string | null
  customerGst?: string | null
  slabSettingsRaw?: unknown
  gstin?: string | null
  /** When true, include IRN / ACK / QR from bill compliance */
  taxInvoiceMode?: boolean
  /** E-way bill number for e-way PDF variant */
  ewayBillNo?: string | null
}): Promise<PdfShareSheetPayload> {
  const lines = params.bill.lines ?? []
  if (!lines.length) {
    throw new Error('No line items on this bill.')
  }

  const settings = await loadErpSettingsBundle()
  const session = (params.bill.session || {}) as ErpBillSession
  const gst = {
    gstin: params.gstin ?? settings.gst?.gstin ?? null,
    legalName: settings.gst?.legalName ?? null,
    address: settings.gst?.address ?? null,
    phone: settings.gst?.phone ?? null,
    email: settings.gst?.email ?? null,
    placeOfSupply: session.placeOfSupply ?? settings.gst?.placeOfSupply ?? null,
  }
  const bank = {
    bankName: settings.bank?.bankName ?? null,
    accountName: settings.bank?.accountName ?? null,
    accountNo: settings.bank?.accountNo ?? null,
    ifsc: settings.bank?.ifsc ?? null,
    branch: settings.bank?.branch ?? null,
  }

  const totals = computeErpQuoteTotals(params.bill, params.slabSettingsRaw)
  const brandLabel = params.brandLabel.trim() || gst.legalName?.trim() || 'Our store'

  let compliance: ErpTaxInvoiceCompliance | null = null
  const einvoice = params.bill.compliance?.einvoice
  if (params.taxInvoiceMode && einvoice?.irn) {
    const response = (einvoice as { response?: unknown }).response
    const signedQr = (einvoice as { signed_qr?: string | null }).signed_qr
    const qrImageSrc = await resolveEinvoiceQrImageSrc({
      irn: einvoice.irn,
      signedQr,
      complianceResponse: response,
    })
    compliance = {
      irn: einvoice.irn,
      ack_no: einvoice.ack_no ?? null,
      ack_date: einvoice.ack_date ?? null,
      qrImageSrc,
      sandbox: einvoice.sandbox,
    }
  }

  const invoiceLayout = settings.gst?.invoiceTemplate || 'marlecha'
  const useChallanTemplate = invoiceLayout !== 'standard'
  const billTemplateConfig = normalizeTaxInvoiceTemplate(settings.taxInvoiceTemplate)
  const einvoiceTemplateConfig = normalizeTaxInvoiceTemplate(
    settings.einvoiceTaxInvoiceTemplate || settings.taxInvoiceTemplate,
  )
  const mrpNames = mrpInvoiceItemNames(await fetchGstInvoiceItems())
  const docProps = {
    bill: params.bill,
    brandName: brandLabel,
    totals,
    gst,
    bank,
    customerName: params.customerName ?? params.bill.customer_name,
    customerAddress: params.customerAddress ?? session.address ?? null,
    customerMobile: params.mobile ?? session.mobile ?? null,
    customerPan: params.customerPan ?? session.pan ?? null,
    customerGst: params.customerGst ?? session.customerGst ?? null,
    compliance,
    ewayBillNo: params.ewayBillNo ?? params.bill.compliance?.eway?.ewb_no ?? null,
    mrpItemNames: mrpNames,
  }

  const isEinvoicePdf = params.taxInvoiceMode && !!compliance?.irn

  const blob = await pdf(
    useChallanTemplate ? (
      <ErpConfigurableTaxInvoicePdfDocument
        {...docProps}
        templateConfig={isEinvoicePdf ? einvoiceTemplateConfig : billTemplateConfig}
        variant={isEinvoicePdf ? 'einvoice' : 'bill'}
      />
    ) : (
      <ErpTaxInvoicePdfDocument {...docProps} />
    ),
  ).toBlob()

  const filename = params.taxInvoiceMode
    ? buildErpSalesPdfFilename(params.bill.bill_number, 'einvoice')
    : params.ewayBillNo
      ? buildErpSalesPdfFilename(params.bill.bill_number, 'eway')
      : buildErpSalesPdfFilename(params.bill.bill_number, 'bill')

  const text = buildErpSalesWhatsAppMessage({
    brandLabel,
    bill: params.bill,
    customerName: params.customerName ?? params.bill.customer_name,
    filename,
    isTaxInvoice: !!compliance?.irn,
  })

  return {
    blob,
    filename,
    title: `${brandLabel} — ${params.taxInvoiceMode ? 'Tax invoice' : 'Invoice'} ${params.bill.bill_number}`,
    text,
    fallbackWhatsAppText: text,
    fallbackWhatsAppHref: null,
    customerWhatsAppHref: erpCustomerWhatsAppHref(params.mobile ?? session.mobile, text),
    customerMobile: normalizeMobileDigits(params.mobile ?? session.mobile) || null,
    brandLabel,
  }
}
