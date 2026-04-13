'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { pdf } from '@react-pdf/renderer'
import { CheckCircle2, Download, Landmark, MessageCircle, Package } from 'lucide-react'
import axios from '@/lib/axios'
import { CATALOG_PATH } from '@/lib/routes'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { parseOrderItemsSnapshot, snapshotLineTitle } from '@/lib/order-snapshot'
import { buildWhatsAppBusinessChatLink, orderConfirmationWhatsAppMessage } from '@/lib/whatsapp'
import {
  B2bProformaPdfDocument,
  type B2bBankDetailsPdf,
  type ProformaLine,
} from '@/lib/b2b-proforma-pdf-document'

type OrderRow = {
  id: number
  total_amount: number
  payment_status?: string
  b2b_checkout_type?: string
  items_snapshot_json?: unknown
  created_at: string
}

function toProformaLines(raw: unknown): ProformaLine[] {
  return parseOrderItemsSnapshot(raw).map((l) => {
    const qty = Number(l.qty) || 1
    const price = Number(l.price) || 0
    return {
      barcode: String(l.barcode || l.sku || '—'),
      item_name: snapshotLineTitle(l),
      sku: l.sku,
      style_code: l.style_code,
      qty,
      line_total: price * qty,
      net_wt_g: l.net_wt_g ?? null,
    }
  })
}

function B2bSuccessInner() {
  const searchParams = useSearchParams()
  const orderIdParam = searchParams.get('orderId')
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [bank, setBank] = useState<B2bBankDetailsPdf | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const orderId = orderIdParam ? parseInt(orderIdParam, 10) : NaN

  const load = useCallback(async () => {
    if (!orderIdParam || Number.isNaN(orderId)) {
      setErr('Missing order')
      setLoading(false)
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const [oRes, bRes] = await Promise.all([
        axios.get<OrderRow>(`/api/orders/${orderId}`),
        axios.get<B2bBankDetailsPdf>('/api/config/b2b-bank'),
      ])
      setOrder(oRes.data)
      setBank(bRes.data)
    } catch {
      setErr('Could not load order details.')
    } finally {
      setLoading(false)
    }
  }, [orderId, orderIdParam])

  useEffect(() => {
    load()
  }, [load])

  const lines = order ? toProformaLines(order.items_snapshot_json) : []
  const displayLines = order ? parseOrderItemsSnapshot(order.items_snapshot_json) : []
  const b2bWhatsAppHref = order
    ? buildWhatsAppBusinessChatLink(
        orderConfirmationWhatsAppMessage({
          orderId: order.id,
          totalInr: Number(order.total_amount || 0),
          kind: 'b2b',
        }),
      )
    : null
  const checkoutLabel =
    order?.b2b_checkout_type === 'LEDGER'
      ? 'Ledger / Khata'
      : order?.b2b_checkout_type === 'NEFT'
        ? 'NEFT / RTGS'
        : 'B2B'

  const downloadPdf = async () => {
    if (!order) return
    const doc = (
      <B2bProformaPdfDocument
        orderId={order.id}
        createdAt={new Date(order.created_at).toLocaleString('en-IN')}
        checkoutLabel={checkoutLabel}
        lines={lines}
        grandTotal={Number(order.total_amount || 0)}
        bank={
          bank || {
            account_name: '',
            bank_name: '',
            account_number: '',
            ifsc: '',
          }
        }
      />
    )
    const blob = await pdf(doc).toBlob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kc-jewellers-proforma-${order.id}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">
        Loading…
      </div>
    )
  }

  if (err || !order) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-16 text-center text-slate-400">
        <p>{err || 'Order not found'}</p>
        <Link href={CATALOG_PATH} className="mt-6 inline-block text-amber-500 text-sm font-medium">
          Back to catalogue
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10 pb-28">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <CheckCircle2 className="size-12 text-emerald-500/90" aria-hidden />
          <h1 className="text-lg font-semibold text-white">Purchase order submitted</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            PO #{order.id} · {checkoutLabel} · Pending approval
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total (est.)</span>
            <span className="font-semibold tabular-nums text-emerald-400">
              ₹{Number(order.total_amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <ul className="divide-y divide-white/5 border-t border-white/10 pt-3 max-h-[40vh] overflow-y-auto">
            {displayLines.map((line, i) => {
              const src = normalizeCatalogImageSrc(line.image_url || undefined)
              const qty = Number(line.qty) || 1
              const lineTotal = (Number(line.price) || 0) * qty
              return (
                <li key={i} className="py-2.5 flex justify-between gap-3 text-xs">
                  <div className="flex gap-2.5 min-w-0 flex-1">
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt=""
                        className="size-11 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="size-11 rounded-lg bg-slate-800 border border-white/10 shrink-0 flex items-center justify-center">
                        <Package className="size-4 text-slate-600" aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-slate-200 font-medium truncate">{snapshotLineTitle(line)}</p>
                      <p className="font-mono text-[10px] text-emerald-500/90 truncate mt-0.5">
                        {line.barcode ? line.barcode : ''}
                        {line.sku ? ` · SKU ${line.sku}` : ''}
                        {line.style_code ? ` · ${line.style_code}` : ''}
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        {line.net_wt_g != null ? `${Number(line.net_wt_g).toFixed(2)} g` : '—'} × {qty}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-300 tabular-nums self-start pt-0.5">
                    ₹{Math.round(lineTotal).toLocaleString('en-IN')}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        {order.b2b_checkout_type === 'NEFT' &&
          bank &&
          (bank.bank_name || bank.account_number || bank.ifsc) && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400/90 text-xs font-semibold uppercase tracking-wide">
                <Landmark className="size-4" aria-hidden />
                Bank transfer
              </div>
              <div className="text-xs text-slate-400 space-y-1 font-mono">
                {bank.account_name && <p>Name: {bank.account_name}</p>}
                {bank.bank_name && <p>Bank: {bank.bank_name}</p>}
                {bank.account_number && <p>A/C: {bank.account_number}</p>}
                {bank.ifsc && <p>IFSC: {bank.ifsc}</p>}
                {bank.upi_id && <p>UPI: {bank.upi_id}</p>}
              </div>
            </div>
          )}

        <p className="text-[11px] text-slate-500 leading-relaxed text-center">
          Shipment after admin confirms payment or ledger entry. You&apos;ll be contacted if anything is needed.
        </p>

        <Link
          href={`/orders/${order.id}`}
          className="flex w-full items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-slate-900/50 text-sm font-medium text-slate-100 hover:bg-slate-800/80 transition-colors"
        >
          <Package className="size-4 text-emerald-400/90" aria-hidden />
          View order &amp; line items
        </Link>

        {b2bWhatsAppHref ? (
          <a
            href={b2bWhatsAppHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition-colors"
          >
            <MessageCircle className="size-5 shrink-0" aria-hidden />
            WhatsApp KC about this PO
          </a>
        ) : null}

        <button
          type="button"
          onClick={downloadPdf}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-slate-100 transition-colors"
        >
          <Download className="size-4" aria-hidden />
          Download proforma (PDF)
        </button>

        <Link
          href={CATALOG_PATH}
          className="flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold"
        >
          <Package className="size-4" aria-hidden />
          Back to catalogue
        </Link>
      </div>
    </div>
  )
}

export default function B2bSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <B2bSuccessInner />
    </Suspense>
  )
}
