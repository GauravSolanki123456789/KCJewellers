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
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { ErpWeighingScaleBar } from '@/components/reseller/erp/ErpWeighingScaleBar'
import { Check, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react'

const cellCls =
  'kc-batch-cell-input w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:bg-white focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15'

export function ErpStockExcelEditor({
  batchId,
  pieces,
  onSaved,
  scaleProfileId,
}: {
  batchId: string
  pieces: ErpStockPiece[]
  onSaved: (rows: ErpStockPiece[]) => void
  scaleProfileId?: string | null
}) {
  const [drafts, setDrafts] = useState<StockRowDraft[]>([])
  const [baseline, setBaseline] = useState<StockRowDraft[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [removeProduct, setRemoveProduct] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const productNames = useMemo(() => {
    const names = new Set<string>()
    for (const p of pieces) {
      const n = p.item_code || p.product_name
      if (n) names.add(n)
    }
    return Array.from(names).sort()
  }, [pieces])

  useEffect(() => {
    const next = pieces.map(pieceToRowDraft)
    setDrafts(next)
    setBaseline(next)
    setSelected(new Set())
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

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const deletable = drafts.filter((d) => d.status !== 'sold').map((d) => d.id)
    if (selected.size === deletable.length) setSelected(new Set())
    else setSelected(new Set(deletable))
  }

  const resetAll = () => {
    setDrafts(baseline.map((b) => ({ ...b, values: { ...b.values } })))
    setMessage(null)
    setError(null)
  }

  const refreshPieces = async () => {
    const res = await axios.get<{ pieces: ErpStockPiece[] }>(
      `/api/reseller/erp/stock-pieces/batches/${batchId}`,
    )
    onSaved(res.data.pieces || [])
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
      setError(erpErr(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.size || deleting) return
    if (!confirm(`Remove ${selected.size} piece(s) from this batch?`)) return
    setDeleting(true)
    try {
      await axios.delete('/api/reseller/erp/stock-pieces', {
        data: { ids: Array.from(selected), batch_id: batchId },
      })
      await refreshPieces()
      setMessage(`Removed ${selected.size} piece(s).`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const deleteByProduct = async () => {
    const name = removeProduct.trim()
    if (!name || deleting) return
    const count = pieces.filter(
      (p) =>
        p.status !== 'sold' &&
        (p.item_code === name || p.product_name === name),
    ).length
    if (!count) {
      alert('No in-stock pieces for that product in this batch.')
      return
    }
    if (!confirm(`Remove all ${count} piece(s) of "${name}" from this batch?`)) return
    setDeleting(true)
    try {
      await axios.delete('/api/reseller/erp/stock-pieces', {
        data: { item_code: name, batch_id: batchId },
      })
      await refreshPieces()
      setRemoveProduct('')
      setMessage(`Removed ${count} piece(s) of ${name}.`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const applyScaleWeight = (grams: number) => {
    const targetId = selected.size === 1 ? Array.from(selected)[0] : drafts.find((d) => d.status !== 'sold')?.id
    if (!targetId) {
      alert('Select one in-stock row (checkbox) to apply weight from the scale.')
      return
    }
    setCell(targetId, 'avg_weight', grams.toFixed(3))
    setMessage(`Weight ${grams.toFixed(3)} g applied — click Save edits.`)
  }

  return (
    <div className="space-y-3">
      <ErpWeighingScaleBar scaleProfileId={scaleProfileId ?? null} onApplyWeight={applyScaleWeight} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={erpBtnPrimary} disabled={saving || dirtyCount === 0} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save edits {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>
        <button
          type="button"
          className={erpBtnGhost}
          onClick={resetAll}
          disabled={dirtyCount === 0}
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-50"
          disabled={deleting || selected.size === 0}
          onClick={() => void deleteSelected()}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete selected {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
        {message ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="size-3.5" />
            {message}
          </span>
        ) : null}
        {error ? <span className="text-xs font-medium text-rose-600">{error}</span> : null}
      </div>

      <div className={`${erpCardCls} flex flex-wrap items-end gap-2`}>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Remove all of product
          </label>
          <select
            className={erpInputCls}
            value={removeProduct}
            onChange={(e) => setRemoveProduct(e.target.value)}
          >
            <option value="">Choose product…</option>
            {productNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={erpBtnGhost}
          disabled={!removeProduct.trim() || deleting}
          onClick={() => void deleteByProduct()}
        >
          <Trash2 className="size-4" />
          Remove category
        </button>
      </div>

      <div className={`${erpCardCls} kc-batch-excel-editor overflow-x-auto p-0`}>
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]">
              <th className="sticky left-0 z-10 bg-[var(--color-slate-900,#faf8f4)] px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === drafts.filter((d) => d.status !== 'sold').length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="sticky left-8 z-10 bg-[var(--color-slate-900,#faf8f4)] px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
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
                  <td className="sticky left-0 z-10 bg-white px-2 py-1">
                    {!readOnly ? (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select row ${idx + 1}`}
                      />
                    ) : null}
                  </td>
                  <td className="sticky left-8 z-10 bg-white px-2 py-1 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1 capitalize text-[var(--color-jewelry-black,#1a1814)]/55">{row.status.replace('_', ' ')}</td>
                  {STOCK_EDITOR_COLUMNS.map((col) => (
                    <td key={col.key} className="min-w-[72px] px-1 py-0.5">
                      <input
                        className={cellCls}
                        type="text"
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
