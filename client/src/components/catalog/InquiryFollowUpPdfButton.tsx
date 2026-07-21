'use client'

import { useCallback, useState } from 'react'
import axios from '@/lib/axios'
import { pdf } from '@react-pdf/renderer'
import { FileImage, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CatalogPdfDocument } from '@/lib/catalog-pdf-document'
import { resolveItemsForPdf, type ItemWithPdfImage } from '@/lib/pdf-embed-images'
import type { SharedCatalogPublicProduct, SharedCatalogCreatorWholesale } from '@/lib/shared-catalog-api'
import {
  sharedCatalogProductToItem,
  wholesaleInputFromBrochure,
  type SharedCatalogSlabPayload,
} from '@/lib/shared-catalog-pricing'
import {
  buildCustomerFollowUpWhatsAppMessage,
  customerWhatsAppHref,
  type CatalogInquiryLine,
  type CatalogInquiryRow,
} from '@/lib/catalog-inquiry-shared'
import {
  sharePdfBlob,
  shouldPresentPdfShareSheet,
  type PdfShareSheetPayload,
} from '@/lib/pdf-share'
import PdfShareSheet from '@/components/shared-catalog/PdfShareSheet'
import { normalizeKcThemeId } from '@/lib/kc-theme-ids'

type PdfContextResponse = {
  brandName: string
  kcThemeId?: string | null
  hidePrices?: boolean
  customerName?: string | null
  customerMobile?: string | null
  catalogUrl?: string | null
  lines: CatalogInquiryLine[]
  products: SharedCatalogPublicProduct[]
  orderSummary: {
    totalPieces: number
    designCount: number
    orderTotalInr: number | null
  }
  pricing: {
    rates: unknown
    markupPercentage: number
    discountPercentage: number
    wholesale?: SharedCatalogCreatorWholesale | null
    slabPayload?: SharedCatalogSlabPayload | null
    giftingGstEnabled?: boolean
  }
}

function inquiryLinesToPdfItems(
  lines: CatalogInquiryLine[],
  products: SharedCatalogPublicProduct[],
): ItemWithPdfImage[] {
  const byCode = new Map<string, SharedCatalogPublicProduct>()
  for (const p of products) {
    const bc = String(p.barcode || '').trim()
    const sku = String(p.sku || '').trim()
    if (bc) byCode.set(bc, p)
    if (sku) byCode.set(sku, p)
  }

  return lines.map((line) => {
    const code = String(line.code || '').trim()
    const product = byCode.get(code) ?? byCode.get(code.toUpperCase())
    const base = product
      ? sharedCatalogProductToItem(product)
      : ({
          barcode: code,
          item_name: line.name,
          name: line.name,
        } as ItemWithPdfImage)

    return {
      ...base,
      shareCatalogQty: line.qty ?? 1,
      shareCatalogDisplayTitle: line.name ?? base.item_name ?? 'Item',
      shareCatalogSize: line.sizeLabel ?? null,
      shareCatalogWeightLabel: line.weightLabel ?? null,
      shareCatalogMetalSpecSummary: line.metalSpecSummary ?? null,
      shareCatalogUnitTotalInr: line.unitInr ?? null,
      shareCatalogLineTotalInr: line.lineTotalInr ?? null,
    }
  })
}

type Props = {
  inquiry: CatalogInquiryRow
  apiPath: 'admin' | 'reseller'
  theme?: 'admin' | 'reseller'
}

export default function InquiryFollowUpPdfButton({
  inquiry,
  apiPath,
  theme = 'admin',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [pdfShareOpen, setPdfShareOpen] = useState(false)
  const [pdfSharePayload, setPdfSharePayload] = useState<PdfShareSheetPayload | null>(null)

  const handlePdf = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const base =
        apiPath === 'admin'
          ? `/api/admin/reseller-catalog-inquiries/${inquiry.id}/pdf-context`
          : `/api/reseller/catalog-inquiries/${inquiry.id}/pdf-context`
      const res = await axios.get<PdfContextResponse>(base)
      const ctx = res.data
      const lines = ctx.lines?.length ? ctx.lines : inquiry.lines ?? []
      if (!lines.length) {
        alert('No line items saved for this inquiry.')
        return
      }

      const itemsForPdf = await resolveItemsForPdf(
        inquiryLinesToPdfItems(lines, ctx.products ?? []),
      )
      const brandLabel = ctx.brandName?.trim() || inquiry.reseller_label?.trim() || 'Our store'
      const hidePrices = !!ctx.hidePrices
      const kcThemeId = normalizeKcThemeId(ctx.kcThemeId ?? null)
      const wholesale = wholesaleInputFromBrochure(ctx.pricing?.wholesale ?? null)
      const slabPayload = ctx.pricing?.slabPayload ?? null

      const blob = await pdf(
        <CatalogPdfDocument
          products={itemsForPdf}
          brandName={brandLabel}
          kcThemeId={kcThemeId}
          itemsLabel={hidePrices ? 'Weight quotation' : 'Quotation with photos'}
          hidePrices={hidePrices}
          orderSummary={{
            totalPieces: ctx.orderSummary?.totalPieces ?? inquiry.total_pieces,
            designCount: ctx.orderSummary?.designCount ?? inquiry.line_count,
            orderTotalInr: hidePrices
              ? null
              : (ctx.orderSummary?.orderTotalInr ?? inquiry.total_inr),
          }}
          resellerPdfPricing={
            hidePrices
              ? null
              : {
                  rates: ctx.pricing?.rates,
                  markupPercentage: ctx.pricing?.markupPercentage ?? 0,
                  discountPercentage: ctx.pricing?.discountPercentage ?? 0,
                  wholesale,
                  giftingGstEnabled: ctx.pricing?.giftingGstEnabled !== false,
                  slabPayload,
                }
          }
        />,
      ).toBlob()

      const slug =
        brandLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'quotation'
      const filename = `${slug}-quotation-${new Date().toISOString().slice(0, 10)}.pdf`

      const followUpText = buildCustomerFollowUpWhatsAppMessage({
        brandLabel,
        customerName: ctx.customerName ?? inquiry.customer_name,
        totalPieces: ctx.orderSummary?.totalPieces ?? inquiry.total_pieces,
        lineCount: ctx.orderSummary?.designCount ?? inquiry.line_count,
        totalInr: ctx.orderSummary?.orderTotalInr ?? inquiry.total_inr,
        lines,
        catalogUrl: ctx.catalogUrl ?? inquiry.catalog_url,
        hidePrices,
      })
      const intro = ctx.customerName?.trim()
        ? `Hi ${ctx.customerName.trim()},`
        : inquiry.customer_name?.trim()
          ? `Hi ${inquiry.customer_name.trim()},`
          : 'Hi,'
      const pdfText = `${intro}\n\nPlease find your quotation from ${brandLabel} attached (${filename}).\n\n${followUpText.split('\n\n').slice(1).join('\n\n')}`

      const customerWa = customerWhatsAppHref(
        ctx.customerMobile ?? inquiry.customer_mobile,
        pdfText,
      )

      const sheetPayload: PdfShareSheetPayload = {
        blob,
        filename,
        title: `${brandLabel} — quotation PDF`,
        text: pdfText,
        fallbackWhatsAppText: pdfText,
        fallbackWhatsAppHref: customerWa,
        brandLabel,
      }

      if (shouldPresentPdfShareSheet()) {
        setPdfSharePayload(sheetPayload)
        setPdfShareOpen(true)
      } else {
        await sharePdfBlob(blob, filename, {
          title: sheetPayload.title,
          text: sheetPayload.text,
          fallbackWhatsAppText: sheetPayload.fallbackWhatsAppText,
          fallbackWhatsAppHref: sheetPayload.fallbackWhatsAppHref,
        })
      }
    } catch (e) {
      console.error(e)
      alert('Could not create the quotation PDF. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [apiPath, busy, inquiry])

  const btnCls =
    theme === 'admin'
      ? 'border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20'
      : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)] hover:border-[var(--kc-accent,#c41e3a)]/40 hover:bg-white'

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          void handlePdf()
        }}
        className={cn(
          'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition sm:w-auto sm:min-w-[200px]',
          busy ? 'cursor-wait opacity-70' : btnCls,
        )}
      >
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <FileImage className="size-4 shrink-0" aria-hidden />
        )}
        {busy ? 'Building PDF…' : 'PDF with photos'}
      </button>

      <PdfShareSheet
        open={pdfShareOpen}
        onOpenChange={setPdfShareOpen}
        payload={pdfSharePayload}
      />
    </>
  )
}
