'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  draftsEqual,
  pieceToRowDraft,
  rowDraftToApiPayload,
  STOCK_EDITOR_COLUMNS,
  type StockEditableField,
  type StockRowDraft,
} from '@/lib/reseller-erp-stock-editor'
import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import { erpBtnPrimary, erpCardCls } from '@/components/reseller/erp/erp-ui'
import { Check, Loader2, RotateCcw, Save } from 'lucide-react'

const cellCls =
  'kc-batch-cell-input w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:bg-white focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15'

export function ErpStockExcelEditor({
  batchId,
  pieces,
  onSaved,
}: {
  batchId: string
  pieces: ErpStockPiece[]
  onSaved: (rows: ErpStockPiece[]) => void
}) {
  const [drafts, setDrafts] = useState<StockRowDraft[]>([])
  const [baseline, setBaseline] = useState<StockRowDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next = pieces.map(pieceToRowDraft)
    setDrafts(next)
    setBaseline(next)
    setMessage(null)
    setError(null)
  }, [pieces])

  const dirtyCount = useMemo(() => {
    let n = 0
    for (let i = 0; i < drafts.length; i++) {
      if (baseline[i] && !draftsEqual(drafts[i], baseline[i])) n++
    }
    return n
  }, [drafts, baseline])

  const setCell = useCallback((rowId: number, field: StockEditableField, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === rowId ? { ...d, values: { ...d.values, [field]: value } } : d)),
    )
    setMessage(null)
    setError(null)
  }, [])

  const resetAll = () => {
    setDrafts(baseline.map((b) => ({ ...b, values: { ...b.values } })))
    setMessage(null)
    setError(null)
  }

  const save = async () => {
    if (saving || dirtyCount === 0) return
    setSaving(true)
    setError(null)
    try {
      const dirty = drafts.filter((d, i) => baseline[i] && !draftsEqual(d, baseline[i]))
      const res = await axios.put<{ pieces: ErpStockPiece[] }>(
        `/api/reseller/erp/stock-pieces/batches/${batchId}/rows`,
        { rows: dirty.map(rowDraftToApiPayload) },
      )
      onSaved(res.data.pieces || [])
      setMessage(`Saved ${dirty.length} row(s).`)
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={erpBtnPrimary} disabled={saving || dirtyCount === 0} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save edits {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]"
          onClick={resetAll}
          disabled={dirtyCount === 0}
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
        {message ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="size-3.5" />
            {message}
          </span>
        ) : null}
        {error ? <span className="text-xs font-medium text-rose-600">{error}</span> : null}
      </div>

      <div className={`${erpCardCls} kc-batch-excel-editor overflow-x-auto p-0`}>
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]">
              <th className="sticky left-0 z-10 bg-[var(--color-slate-900,#faf8f4)] px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                #
              </th>
              <th className="px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">Status</th>
              {STOCK_EDITOR_COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                  {col.shortLabel || col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drafts.map((row, idx) => {
              const isDirty = baseline[idx] && !draftsEqual(row, baseline[idx])
              const readOnly = row.status === 'sold'
              return (
                <tr
                  key={row.id}
                  className={`border-b border-[var(--color-slate-700,#e8e4df)]/60 ${isDirty ? 'bg-[var(--kc-accent,#c41e3a)]/[0.04]' : ''} ${readOnly ? 'opacity-60' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1 capitalize text-[var(--color-jewelry-black,#1a1814)]/55">{row.status.replace('_', ' ')}</td>
                  {STOCK_EDITOR_COLUMNS.map((col) => (
                    <td key={col.key} className="min-w-[72px] px-1 py-0.5">
                      <input
                        className={cellCls}
                        type={col.type === 'number' ? 'text' : 'text'}
                        inputMode={col.type === 'number' ? 'decimal' : 'text'}
                        value={row.values[col.key]}
                        readOnly={readOnly}
                        onChange={(e) => setCell(row.id, col.key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
