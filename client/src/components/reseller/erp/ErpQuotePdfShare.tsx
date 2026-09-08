'use client'

import { useCallback, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import axios from '@/lib/axios'
import { FileImage, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ErpQuotePdfDocument } from '@/lib/erp-quote-pdf-document'
import { resolveItemsForPdf } from '@/lib/pdf-embed-images'
import {
  sharePdfBlob,
  shouldPresentPdfShareSheet,
  type PdfShareSheetPayload,
} from '@/lib/pdf-share'
import PdfShareSheet from '@/components/shared-catalog/PdfShareSheet'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import {
  buildErpQuotePdfFilename,
  buildErpQuoteWhatsAppMessage,
  computeErpQuoteTotals,
  enrichErpBillLinesForDisplay,
  erpCustomerWhatsAppHref,
  billRatesUnfixed,
  erpLinesToPdfItems,
  resolveErpLineImages,
} from '@/lib/erp-quote-pdf'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'

function normalizeMobileDigits(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(-10)
}

async function resolveBillCustomerMobile(
  bill: ErpBill,
  mobile?: string | null,
): Promise<string> {
  let m = normalizeMobileDigits(mobile ?? bill.session?.mobile)
  if (m.length === 10) return m
  const searchQ = bill.customer_name?.trim() || (bill.customer_id ? String(bill.customer_id) : '')
  if (!searchQ) return ''
  try {
    const res = await axios.get<{ customers: { id: number; mobile?: string | null; name?: string }[] }>(
      '/api/reseller/erp/customers',
      { params: { q: searchQ } },
    )
    const list = res.data.customers || []
    const row =
      (bill.customer_id ? list.find((c) => c.id === bill.customer_id) : null) ||
      list.find((c) => c.name?.trim().toLowerCase() === bill.customer_name?.trim().toLowerCase()) ||
      list[0]
    m = normalizeMobileDigits(row?.mobile)
    if (m.length === 10) return m
  } catch {
    /* ignore */
  }
  return ''
}

export async function shareErpQuotePdf(params: {
  bill: ErpBill
  brandLabel: string
  customerName?: string | null
  mobile?: string | null
  kcThemeId?: string | null
  slabSettingsRaw?: unknown
  layoutMode?: 'detailed' | 'summary'
  onSheet?: (payload: PdfShareSheetPayload) => void
}): Promise<void> {
  const enrichedLines = enrichErpBillLinesForDisplay(params.bill, params.slabSettingsRaw)
  if (!enrichedLines.length) {
    alert('No line items to include in the quotation PDF.')
    return
  }

  const linesWithImages = await resolveErpLineImages(enrichedLines)
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
      layoutMode={params.layoutMode ?? 'detailed'}
    />,
  ).toBlob()

  const filename = buildErpQuotePdfFilename({
    billNumber: params.bill.bill_number,
    customerName: params.customerName ?? params.bill.customer_name,
    createdAt: params.bill.created_at ?? null,
  })

  const text = buildErpQuoteWhatsAppMessage({
    brandLabel,
    bill: params.bill,
    customerName: params.customerName ?? params.bill.customer_name,
    mobile: params.mobile,
    filename,
  })

  const resolvedMobile = await resolveBillCustomerMobile(params.bill, params.mobile)
  const customerWaHref = erpCustomerWhatsAppHref(resolvedMobile || null, text)

  const sheetPayload: PdfShareSheetPayload = {
    blob,
    filename,
    title: `${brandLabel} — ${params.bill.bill_number}`,
    text,
    fallbackWhatsAppText: text,
    fallbackWhatsAppHref: customerWaHref,
    customerWhatsAppHref: customerWaHref,
    customerMobile: resolvedMobile || null,
    brandLabel,
  }

  if (shouldPresentPdfShareSheet() && params.onSheet) {
    params.onSheet(sheetPayload)
    return
  }

  await sharePdfBlob(blob, filename, {
    title: sheetPayload.title,
    text: sheetPayload.text,
    fallbackWhatsAppText: sheetPayload.fallbackWhatsAppText,
    fallbackWhatsAppHref: sheetPayload.fallbackWhatsAppHref,
    customerWhatsAppHref: sheetPayload.customerWhatsAppHref,
    customerMobile: sheetPayload.customerMobile,
  })
}

type Props = {
  bill: ErpBill
  brandLabel: string
  customerName?: string | null
  mobile?: string | null
  kcThemeId?: string | null
  className?: string
  label?: string
}

export function ErpQuotePdfButton({
  bill,
  brandLabel,
  customerName,
  mobile,
  kcThemeId,
  className,
  label = 'PDF with photos',
}: Props) {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetPayload, setSheetPayload] = useState<PdfShareSheetPayload | null>(null)

  const run = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await shareErpQuotePdf({
        bill,
        brandLabel,
        customerName,
        mobile,
        kcThemeId,
        slabSettingsRaw: auth.user,
        onSheet: (payload) => {
          setSheetPayload(payload)
          setSheetOpen(true)
        },
      })
    } catch (e) {
      console.error(e)
      alert('Could not create the quotation PDF. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [bill, brandLabel, busy, customerName, kcThemeId, mobile])

  return (
    <>
      <button type="button" disabled={busy} onClick={() => void run()} className={className} title="PDF with photos">
        {busy ? <Loader2 className="size-4 animate-spin" /> : label ? label : <FileImage className="size-4" />}
      </button>
      <PdfShareSheet open={sheetOpen} onOpenChange={setSheetOpen} payload={sheetPayload} minimal />
    </>
  )
}
