'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBill,
} from '@/components/reseller/erp/erp-ui'
import { ErpQuotePdfButton } from '@/components/reseller/erp/ErpQuotePdfShare'
import { ErpBillPreviewModal } from '@/components/reseller/erp/ErpBillPreviewModal'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { erpDateFilterToIso, erpDefaultHistoryFromIso, isoToDdMmYyyyInput } from '@/lib/erp-date-format'
import { sortErpBillsDesc } from '@/lib/erp-bill-sort'
import { summarizeBillsMetalTotals } from '@/lib/erp-bill-metal-totals'
import { useAuth } from '@/hooks/useAuth'
import { type WholesaleUserFields } from '@/lib/customer-tier'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { ClipboardList, Eye, Loader2, Search } from 'lucide-react'

export function ErpJainavEstimatesWorkspace() {
  const auth = useAuth()
  const brandLabel =
    (auth.user as WholesaleUserFields)?.business_name?.trim() || 'Our store'

  const [bills, setBills] = useState<ErpBill[]>([])
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(() => isoToDdMmYyyyInput(erpDefaultHistoryFromIso()))
  const [to, setTo] = useState('')
  const [onDate, setOnDate] = useState('')
  const [previewBill, setPreviewBill] = useState<ErpBill | null>(null)

  const load = useCallback(async () => {
    const params: Record<string, string> = {}
    if (q.trim()) params.q = q.trim()
    const onIso = erpDateFilterToIso(onDate)
    const fromIso = erpDateFilterToIso(from)
    const toIso = erpDateFilterToIso(to)
    if (onIso) params.on = onIso
    else {
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
    }
    setBusy(true)
    try {
      const res = await axios.get<{ estimates: ErpBill[] }>('/api/reseller/erp/shadow/estimates', {
        params,
      })
      setBills(sortErpBillsDesc(res.data.estimates || []))
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }, [q, from, to, onDate])

  useEffect(() => {
    void load()
  }, [load])

  const metal = useMemo(() => summarizeBillsMetalTotals(bills), [bills])
  const totalValue = useMemo(
    () => bills.reduce((s, b) => s + (Number(b.total_inr) || 0), 0),
    [bills],
  )

  const openPreview = async (row: ErpBill) => {
    setBusy(true)
    try {
      const res = await axios.get<{ bill: ErpBill }>(`/api/reseller/erp/shadow/estimates/${row.id}`)
      setPreviewBill(res.data.bill)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">
            <ClipboardList className="size-5 text-emerald-800" aria-hidden />
            Lane quotations
          </h1>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Estimates billed in lane mode only — not shown in normal quotation history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#e8e4df] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Refresh
        </button>
      </div>

      <div className={`${erpCardCls} grid gap-2 sm:grid-cols-2 lg:grid-cols-4`}>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          Search
          <input
            className={`${erpInputCls} mt-1`}
            placeholder="Quote no, customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          From
          <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          To
          <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
          On date
          <ErpDateInput className={`${erpInputCls} mt-1`} value={onDate} onChange={setOnDate} />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${erpCardCls} bg-sky-50/80`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">Quotations</p>
          <p className="text-2xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{bills.length}</p>
        </div>
        <div className={`${erpCardCls} bg-emerald-50/80`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">Total value</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-900">{formatErpInr(totalValue)}</p>
        </div>
        <div className={`${erpCardCls} bg-violet-50/80`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">Silver weight</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
            {metal.silverWeightGm.toFixed(3)} g
          </p>
        </div>
        <div className={`${erpCardCls} bg-amber-50/80`}>
          <p className="text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">Silver value</p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
            {formatErpInr(metal.silverValueInr)}
          </p>
        </div>
      </div>

      <div className={`${erpCardCls} overflow-x-auto`}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#e8e4df] text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              <th className="px-2 py-2">Quote no</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2 text-right">Net total</th>
              <th className="px-2 py-2">Lane bill</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-8 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                  {busy ? 'Loading…' : 'No lane quotations in this period.'}
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="border-b border-[#e8e4df]/80 last:border-0">
                  <td className="px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.bill_number}</td>
                  <td className="px-2 py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                    {formatErpDateDdMmYyyy(b.bill_date)}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-[var(--color-jewelry-black,#1a1814)]">
                    {b.customer_name || '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                    {formatErpInr(b.total_inr)}
                  </td>
                  <td className="px-2 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                    {(b as ErpBill & { shadow_bill_number?: string }).shadow_bill_number || '—'}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void openPreview(b)}
                        className="inline-flex size-10 items-center justify-center rounded-lg border border-[#e8e4df] bg-white text-[var(--color-jewelry-black,#1a1814)]"
                        aria-label="Preview"
                      >
                        <Eye className="size-4" />
                      </button>
                      <ErpQuotePdfButton
                        bill={b}
                        brandLabel={brandLabel}
                        customerName={b.customer_name}
                        mobile={b.session?.mobile}
                        label=""
                        className="inline-flex size-10 items-center justify-center rounded-lg border border-[#e8e4df] bg-white text-[var(--color-jewelry-black,#1a1814)]"
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previewBill ? (
        <ErpBillPreviewModal bill={previewBill} kind="estimate" onClose={() => setPreviewBill(null)} />
      ) : null}
    </div>
  )
}
