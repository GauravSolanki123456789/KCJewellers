'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { pdf } from '@react-pdf/renderer'
import { CheckCircle2, Download, Landmark, Package } from 'lucide-react'
import axios from '@/lib/axios'
import { CATALOG_PATH } from '@/lib/routes'
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

function parseSnapshot(raw: unknown): ProformaLine[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.map((row: Record<string, unknown>) => {
    const qty = Number(row.qty) || 1
    const price = Number(row.price) || 0
    const net = row.net_wt_g ?? row.net_weight ?? row.net_wt
    return {
      barcode: String(row.barcode ?? row.sku ?? '—'),
      item_name: String(row.item_name ?? 'Item'),
      qty,
      line_total: price * qty,
      net_wt_g: net != null && net !== '' ? Number(net) : null,
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

  const lines = order ? parseSnapshot(order.items_snapshot_json) : []
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
            {lines.map((line, i) => (
              <li key={i} className="py-2.5 flex justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-emerald-400/90 truncate">{line.barcode}</p>
                  <p className="text-slate-400 truncate">{line.item_name}</p>
                  <p className="text-slate-600 mt-0.5">
                    {line.net_wt_g != null ? `${Number(line.net_wt_g).toFixed(2)} g` : '—'} × {line.qty}
                  </p>
                </div>
                <span className="shrink-0 text-slate-300 tabular-nums">
                  ₹{Math.round(line.line_total).toLocaleString('en-IN')}
                </span>
              </li>
            ))}
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
