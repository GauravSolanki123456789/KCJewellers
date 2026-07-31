'use client'

import { X } from 'lucide-react'
import {
  erpBtnGhost,
  erpCardCls,
  type ErpBill,
  type ErpBillLine,
} from '@/components/reseller/erp/erp-ui'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { formatErpInr } from '@/lib/reseller-erp-modules'

function lineRate(line: ErpBillLine): string {
  if (line.rateLocked) return '—'
  return line.ratePerGram != null ? String(line.ratePerGram) : '—'
}

type Props = {
  bill: ErpBill | null
  kind: 'estimate' | 'sale'
  onClose: () => void
}

export function ErpBillPreviewModal({ bill, kind, onClose }: Props) {
  if (!bill) return null

  const lines = bill.lines ?? []
  const session = bill.session
  const ratesUnfixed =
    session?.ratesUnfixed || (lines.length > 0 && lines.every((l) => l.rateLocked))
  let weight = 0
  for (const l of lines) weight += Number(l.weightGm) || 0

  const title = kind === 'estimate' ? 'Estimation preview' : 'Sales bill preview'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={`${erpCardCls} max-h-[90vh] w-full max-w-3xl overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              {title}
            </p>
            <h3 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">{bill.bill_number}</h3>
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
              {bill.customer_name || 'Walk-in'}
              {' · '}
              {formatErpDateDdMmYyyy(bill.created_at ?? bill.bill_date)}
              {session?.rateSlab ? ` · Slab ${session.rateSlab}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {ratesUnfixed ? (
              <span className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                Rate unfix
              </span>
            ) : null}
            <button type="button" className={erpBtnGhost} onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          <table className="w-full min-w-[640px] text-[11px]">
            <thead>
              <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Barcode</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Wt</th>
                <th className="px-2 py-2">Rate</th>
                <th className="px-2 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No line items.
                  </td>
                </tr>
              ) : (
                lines.map((line, i) => (
                  <tr key={`${line.barcode || line.code}-${i}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                    <td className="px-2 py-2 tabular-nums">{i + 1}</td>
                    <td className="max-w-[100px] truncate px-2 py-2">{line.barcode || line.code || '—'}</td>
                    <td className="max-w-[140px] truncate px-2 py-2 font-medium">{line.name}</td>
                    <td className="px-2 py-2 tabular-nums">{line.weightGm ?? '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{lineRate(line)}</td>
                    <td className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                      {formatErpInr(line.lineTotalInr ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-2 text-xs">
          <span className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2">
            Items <strong className="ml-1 tabular-nums">{lines.length}</strong>
          </span>
          <span className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2">
            Weight <strong className="ml-1 tabular-nums">{weight.toFixed(2)}g</strong>
          </span>
          <span className="rounded-lg border-2 border-[var(--kc-accent,#c41e3a)]/30 bg-[var(--kc-accent,#c41e3a)]/[0.06] px-3 py-2 font-bold text-[var(--kc-accent,#c41e3a)]">
            Net {formatErpInr(bill.total_inr)}
          </span>
        </div>
      </div>
    </div>
  )
}
