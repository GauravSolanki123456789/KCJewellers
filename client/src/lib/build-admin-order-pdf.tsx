'use client'

import { pdf } from '@react-pdf/renderer'
import {
  AdminOrderPdfDocument,
  formatDeliveryStatusForPdf,
  type AdminOrderPdfLine,
} from '@/lib/admin-order-pdf-document'
import { parseOrderItemsSnapshot, type OrderSnapshotLine } from '@/lib/order-snapshot'
import { fetchCatalogImageAsDataUrl } from '@/lib/pdf-embed-images'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

/** Same fields as admin order list/detail API responses — keep in sync with those pages. */
export type AdminOrderPdfSource = {
  id: number
  total_amount?: number
  payment_status?: string
  payment_method?: string
  delivery_status?: string
  order_channel?: string
  items_snapshot_json?: unknown
  created_at: string
  customer_name?: string
  customer_email?: string
  customer_mobile?: string
}

export function adminOrderPdfFilename(orderId: number): string {
  return `kc-jewellers-order-${orderId}.pdf`
}

/**
 * Fingerprint for PDF output. When this matches, a cached `Blob` is safe to reuse
 * (e.g. download then WhatsApp share). Keep fields aligned with `buildAdminOrderPdfBlob` inputs.
 */
export function orderPdfCacheKey(o: AdminOrderPdfSource): string {
  return JSON.stringify({
    id: o.id,
    total_amount: o.total_amount,
    payment_status: o.payment_status,
    payment_method: o.payment_method,
    delivery_status: o.delivery_status,
    order_channel: o.order_channel,
    created_at: o.created_at,
    customer_name: o.customer_name,
    customer_email: o.customer_email,
    customer_mobile: o.customer_mobile,
    items_snapshot_json: o.items_snapshot_json,
  })
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

async function attachLineImages(lines: OrderSnapshotLine[]): Promise<AdminOrderPdfLine[]> {
  if (lines.length === 0) return []
  const concurrency = 5
  const out: AdminOrderPdfLine[] = new Array(lines.length)
  let idx = 0

  async function worker() {
    for (;;) {
      const i = idx++
      if (i >= lines.length) return
      const line = lines[i]
      const normalized = normalizeCatalogImageSrc(line.image_url || undefined)
      if (!normalized) {
        out[i] = { ...line }
        continue
      }
      const dataUrl = await fetchCatalogImageAsDataUrl(normalized)
      out[i] = dataUrl ? { ...line, pdfImageSrc: dataUrl } : { ...line }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, lines.length) }, () => worker()),
  )
  return out
}

export async function buildAdminOrderPdfBlob(order: AdminOrderPdfSource): Promise<Blob> {
  const rawLines = parseOrderItemsSnapshot(order.items_snapshot_json)
  const lines = await attachLineImages(rawLines)
  const grandTotal = Number(order.total_amount || 0)
  const createdAtLabel = fmtDate(order.created_at)
  const generatedAtLabel = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const doc = (
    <AdminOrderPdfDocument
      orderId={order.id}
      createdAtLabel={createdAtLabel}
      displayStatus={formatDeliveryStatusForPdf(order.delivery_status)}
      orderChannelLabel={order.order_channel === 'B2B_WHOLESALE' ? 'B2B wholesale' : 'Retail'}
      paymentLabel={String(order.payment_method || order.payment_status || '—')}
      customerName={order.customer_name?.trim() || '—'}
      customerEmail={order.customer_email?.trim() || ''}
      customerMobile={order.customer_mobile?.trim() || ''}
      lines={lines}
      grandTotal={grandTotal}
      generatedAtLabel={generatedAtLabel}
    />
  )
  return pdf(doc).toBlob()
}
