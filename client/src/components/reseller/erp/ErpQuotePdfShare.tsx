'use client'

import { useCallback, useState } from 'react'
import { pdf } from '@react-pdf/renderer'
import { FileImage, Loader2 } from 'lucide-react'
import { CatalogPdfDocument } from '@/lib/catalog-pdf-document'
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
  erpCustomerWhatsAppHref,
  erpLinesToPdfItems,
} from '@/lib/erp-quote-pdf'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'

export async function shareErpQuotePdf(params: {
  bill: ErpBill
  brandLabel: string
  customerName?: string | null
  mobile?: string | null
  kcThemeId?: string | null
  onSheet?: (payload: PdfShareSheetPayload) => void
}): Promise<void> {
  const lines = params.bill.lines ?? []
  if (!lines.length) {
    alert('No line items to include in the quotation PDF.')
    return
  }

  const itemsForPdf = await resolveItemsForPdf(erpLinesToPdfItems(lines))
  const brandLabel = params.brandLabel.trim() || 'Our store'
  const kcThemeId = normalizeKcThemeId(params.kcThemeId ?? null)

  const blob = await pdf(
    <CatalogPdfDocument
      products={itemsForPdf}
      brandName={brandLabel}
      kcThemeId={kcThemeId}
      itemsLabel="Quotation with photos"
      orderSummary={{
        totalPieces: lines.reduce((s, l) => s + (Number(l.qty) || 1), 0),
        designCount: lines.length,
        orderTotalInr: params.bill.total_inr,
      }}
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

  const sheetPayload: PdfShareSheetPayload = {
    blob,
    filename,
    title: `${brandLabel} — ${params.bill.bill_number}`,
    text,
    fallbackWhatsAppText: text,
    fallbackWhatsAppHref: erpCustomerWhatsAppHref(params.mobile, text),
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
