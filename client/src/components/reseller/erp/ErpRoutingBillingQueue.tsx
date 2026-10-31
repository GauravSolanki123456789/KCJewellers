'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  completeBillingQueueItem,
  fetchBillingQueue,
  type BillingQueueItem,
} from '@/lib/erp-customer-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Loader2, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  onMsg?: (m: string) => void
  onErr?: (m: string) => void
}

export function ErpRoutingBillingQueue({ onMsg, onErr }: Props) {
  const [items, setItems] = useState<BillingQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<
    Record<number, { invoice: string; payment_mode: string; amount: string }>
  >({})

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const q = await fetchBillingQueue('pending')
      setItems(q)
    } catch {
      onErr?.('Could not load billing queue')
    } finally {
      setLoading(false)
    }
  }, [onErr])

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 5000)
    return () => window.clearInterval(t)
  }, [reload])

  const complete = async (item: BillingQueueItem) => {
    const d = drafts[item.id] || {
      invoice: '',
      payment_mode: 'bank',
      amount: String(item.estimated_amount_inr ?? ''),
    }
    setBusyId(item.id)
    try {
      await completeBillingQueueItem(item.id, {
        invoice_number: d.invoice.trim(),
        payment_mode: d.payment_mode,
        payment_amount_inr: d.amount.trim() || undefined,
        payment_status: 'paid',
      })
      onMsg?.('Billing completed — visit closed as purchased')
      setItems((list) => list.filter((x) => x.id !== item.id))
    } catch {
      onErr?.('Could not complete billing')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={`${erpCardCls} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Receipt className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
          Billing queue
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900">
            {items.length} pending
          </span>
        </p>
        <button type="button" className={erpBtnGhost} onClick={() => void reload()}>
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
          No customers waiting for billing.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const d = drafts[item.id] || {
              invoice: '',
              payment_mode: 'bank',
              amount: String(item.estimated_amount_inr ?? ''),
            }
            return (
              <li
                key={item.id}
                className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {item.customer_name}
                      <span className="ml-2 text-xs font-normal text-[var(--color-jewelry-black,#1a1814)]/55">
                        #{item.customer_id}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
                      {item.customer_mobile || '—'} · {item.counter_name || 'Counter'} ·{' '}
                      {item.operator_name || 'Staff'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/80">
                      Est. {item.estimation_number || '—'}
                      {item.estimated_amount_inr != null
                        ? ` · ₹${Number(item.estimated_amount_inr).toLocaleString('en-IN')}`
                        : ''}
                      {item.gross_weight_gm != null ? ` · ${item.gross_weight_gm}g gross` : ''}
                      {item.net_weight_gm != null ? ` · ${item.net_weight_gm}g net` : ''}
                    </p>
                  </div>
                  <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-md">
                    <input
                      className={erpInputCls}
                      placeholder="Invoice / bill no. (optional)"
                      value={d.invoice}
                      onChange={(e) =>
                        setDrafts((p) => ({
                          ...p,
                          [item.id]: { ...d, invoice: e.target.value },
                        }))
                      }
                    />
                    <select
                      className={erpInputCls}
                      value={d.payment_mode}
                      onChange={(e) =>
                        setDrafts((p) => ({
                          ...p,
                          [item.id]: { ...d, payment_mode: e.target.value },
                        }))
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank / UPI</option>
                      <option value="card">Card</option>
                      <option value="mixed">Mixed</option>
                    </select>
                    <input
                      className={erpInputCls}
                      placeholder="Payment ₹"
                      inputMode="decimal"
                      value={d.amount}
                      onChange={(e) =>
                        setDrafts((p) => ({
                          ...p,
                          [item.id]: { ...d, amount: e.target.value },
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={cn(erpBtnPrimary, 'min-h-[44px]')}
                      disabled={busyId === item.id}
                      onClick={() => void complete(item)}
                    >
                      {busyId === item.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        'Complete billing'
                      )}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
