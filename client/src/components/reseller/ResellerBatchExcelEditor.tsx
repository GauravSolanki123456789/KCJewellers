'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  applyColumnValue,
  BATCH_EDITOR_COLUMNS,
  draftsEqual,
  estimateRowPriceInr,
  MC_TYPE_OPTIONS,
  normalizeMcTypeInput,
  rowDraftToApiPayload,
  submissionToRowDraft,
  type BatchEditableField,
  type BatchRowDraft,
} from '@/lib/reseller-batch-editor'
import type { ResellerProductSubmission } from '@/lib/reseller-products'
import { Check, Columns3, Loader2, RotateCcw, Save } from 'lucide-react'

const inputCls =
  'kc-batch-cell-input w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs tabular-nums outline-none transition focus:border-[var(--kc-accent,#c41e3a)] focus:bg-white focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15'

const METAL_OPTIONS = [
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
  { value: 'gifting', label: 'Gift' },
  { value: 'diamond', label: 'Diamond' },
]

function formatInr(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${n.toLocaleString('en-IN')}`
}

export function ResellerBatchExcelEditor({
  batchId,
  products,
  rates,
  onSaved,
}: {
  batchId: string
  products: ResellerProductSubmission[]
  rates: unknown
  onSaved: (rows: ResellerProductSubmission[]) => void
}) {
  const [drafts, setDrafts] = useState<BatchRowDraft[]>([])
  const [baseline, setBaseline] = useState<BatchRowDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fillField, setFillField] = useState<BatchEditableField | null>(null)
  const [fillValue, setFillValue] = useState('')

  const productById = useMemo(() => {
    const m = new Map<number, ResellerProductSubmission>()
    for (const p of products) m.set(p.id, p)
    return m
  }, [products])

  useEffect(() => {
    const next = products.map(submissionToRowDraft)
    setDrafts(next)
    setBaseline(next)
    setMessage(null)
    setError(null)
  }, [products])

  const dirtyIds = useMemo(() => {
    const ids = new Set<number>()
    for (let i = 0; i < drafts.length; i++) {
      const base = baseline[i]
      if (base && !draftsEqual(drafts[i], base)) ids.add(drafts[i].id)
    }
    return ids
  }, [drafts, baseline])

  const dirtyCount = dirtyIds.size

  const setCell = useCallback((rowId: number, field: BatchEditableField, value: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === rowId
          ? {
              ...d,
              values: {
                ...d.values,
                [field]: field === 'mc_type' ? normalizeMcTypeInput(value) : value,
              },
            }
          : d,
      ),
    )
    setMessage(null)
    setError(null)
  }, [])

  const resetAll = () => {
    setDrafts(baseline.map((b) => ({ ...b, values: { ...b.values } })))
    setMessage(null)
    setError(null)
  }

  const applyFillColumn = () => {
    if (!fillField) return
    setDrafts((prev) => applyColumnValue(prev, fillField, fillValue))
    setFillField(null)
    setFillValue('')
    setMessage(null)
    setError(null)
  }

  const quickFillMcType = (value: string) => {
    setDrafts((prev) => {
      const next = applyColumnValue(prev, 'mc_type', value)
      setMessage(
        `MCType set to ${normalizeMcTypeInput(value)} for all ${next.length} rows (save to apply).`,
      )
      return next
    })
    setError(null)
  }

  const saveAll = async () => {
    if (dirtyCount === 0) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const patches = drafts
        .filter((d) => dirtyIds.has(d.id))
        .map((d) => {
          const orig = productById.get(d.id)
          if (!orig) return null
          return { id: d.id, ...rowDraftToApiPayload(d, orig) }
        })
        .filter(Boolean)

      const res = await axios.put<{ success?: boolean; submissions?: ResellerProductSubmission[] }>(
        `/api/reseller/product-batches/${encodeURIComponent(batchId)}/rows`,
        { rows: patches },
      )
      const updated = res.data?.submissions ?? []
      if (updated.length > 0) {
        const byId = new Map(updated.map((r) => [r.id, r]))
        const merged = products.map((p) => byId.get(p.id) ?? p)
        onSaved(merged)
        setMessage(`Saved ${updated.length} row${updated.length === 1 ? '' : 's'}. Prices updated.`)
      } else {
        setMessage('Saved.')
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null
      setError(msg || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  if (products.length === 0) return null

  return (
    <div className="kc-batch-excel-editor mt-4 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-sm">
      <div className="border-b border-[var(--color-slate-700,#e8e4df)] px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Columns3 className="size-5 shrink-0 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
              <h3 className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Edit Excel data</h3>
            </div>
            <p className="kc-upload-hint mt-1 text-xs leading-relaxed">
              Fix MCType (MC/GM ↔ MC/PC), weights, wastage, and rates here — like Excel. Changes apply to all
              products in this batch after you save. Then add photos below.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              disabled={dirtyCount === 0 || saving}
              onClick={resetAll}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              Reset
            </button>
            <button
              type="button"
              disabled={dirtyCount === 0 || saving}
              onClick={() => void saveAll()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save {dirtyCount > 0 ? `(${dirtyCount})` : 'changes'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="self-center text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Quick fill MCType
          </span>
          {MC_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => quickFillMcType(opt.value)}
              className="min-h-[36px] rounded-lg border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/5 px-3 py-1.5 text-xs font-semibold text-[var(--kc-accent,#c41e3a)] transition hover:bg-[var(--kc-accent,#c41e3a)]/10"
            >
              All → {opt.value}
            </button>
          ))}
        </div>

        {fillField ? (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--color-slate-900,#f7f4ef)] p-3">
            <label className="min-w-[120px] flex-1">
              <span className="kc-upload-label block text-[10px] uppercase tracking-wide">
                Set entire column: {BATCH_EDITOR_COLUMNS.find((c) => c.key === fillField)?.label}
              </span>
              {fillField === 'mc_type' ? (
                <select
                  className="kc-upload-input mt-1 w-full rounded-lg px-2 py-2 text-sm"
                  value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)}
                >
                  {MC_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="kc-upload-input mt-1 w-full rounded-lg px-2 py-2 text-sm"
                  value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)}
                />
              )}
            </label>
            <button
              type="button"
              onClick={applyFillColumn}
              className="min-h-[40px] rounded-lg bg-[var(--kc-accent,#c41e3a)] px-4 py-2 text-xs font-semibold text-white"
            >
              Apply to all rows
            </button>
            <button
              type="button"
              onClick={() => {
                setFillField(null)
                setFillValue('')
              }}
              className="min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        ) : null}

        {message ? (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <Check className="size-3.5 shrink-0" />
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        ) : null}
      </div>

      <div className="kc-batch-grid-scroll overflow-x-auto overscroll-x-contain">
        <table className="kc-batch-grid w-full min-w-[720px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]">
              <th className="kc-batch-sticky-col z-20 min-w-[36px] px-2 py-2.5 text-center font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                #
              </th>
              {BATCH_EDITOR_COLUMNS.map((col) => (
                <th key={col.key} className="min-w-[88px] px-1 py-2 align-bottom">
                  <button
                    type="button"
                    onClick={() => {
                      setFillField(col.key)
                      setFillValue(
                        col.key === 'mc_type'
                          ? 'MC/PC'
                          : col.key === 'metal_type'
                            ? 'silver'
                            : '',
                      )
                    }}
                    className="group w-full rounded-lg px-1 py-1 text-left transition hover:bg-white/80"
                    title={`Fill entire ${col.label} column`}
                  >
                    <span className="block font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {col.shortLabel || col.label}
                    </span>
                    {col.excelHint ? (
                      <span className="kc-upload-hint block text-[10px]">{col.excelHint}</span>
                    ) : (
                      <span className="kc-upload-hint block text-[10px] opacity-0 group-hover:opacity-100">
                        Tap to fill column
                      </span>
                    )}
                  </button>
                </th>
              ))}
              <th className="min-w-[72px] px-2 py-2.5 text-right font-semibold text-emerald-800">Est. ₹</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft, index) => {
              const orig = productById.get(draft.id)
              if (!orig) return null
              const dirty = dirtyIds.has(draft.id)
              const est = estimateRowPriceInr(draft, orig, rates)
              return (
                <tr
                  key={draft.id}
                  className={`border-b border-[var(--color-slate-700,#e8e4df)]/60 ${
                    dirty ? 'bg-amber-50/80' : index % 2 === 0 ? 'bg-white' : 'bg-[var(--color-slate-950,#faf8f4)]/40'
                  }`}
                >
                  <td className="kc-batch-sticky-col z-10 px-2 py-1 text-center tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">
                    {index + 1}
                  </td>
                  {BATCH_EDITOR_COLUMNS.map((col) => {
                    const val = draft.values[col.key] ?? ''
                    if (col.type === 'mc_type') {
                      return (
                        <td key={col.key} className="px-1 py-0.5">
                          <select
                            className={`${inputCls} font-semibold ${
                              val === 'MC/PC'
                                ? 'text-[var(--kc-accent,#c41e3a)]'
                                : 'text-[var(--color-jewelry-black,#1a1814)]'
                            }`}
                            value={val || 'MC/GM'}
                            onChange={(e) => setCell(draft.id, col.key, e.target.value)}
                          >
                            {MC_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.value}
                              </option>
                            ))}
                          </select>
                        </td>
                      )
                    }
                    if (col.type === 'metal') {
                      return (
                        <td key={col.key} className="px-1 py-0.5">
                          <select
                            className={inputCls}
                            value={val || 'silver'}
                            onChange={(e) => setCell(draft.id, col.key, e.target.value)}
                          >
                            {METAL_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      )
                    }
                    return (
                      <td key={col.key} className="px-1 py-0.5">
                        <input
                          className={`${inputCls} ${
                            col.key === 'product_name' ? 'min-w-[120px] font-medium' : ''
                          }`}
                          type={col.type === 'number' ? 'text' : 'text'}
                          inputMode={col.type === 'number' ? 'decimal' : 'text'}
                          value={val}
                          onChange={(e) => setCell(draft.id, col.key, e.target.value)}
                          aria-label={`${col.label} row ${index + 1}`}
                        />
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-emerald-800">
                    {formatInr(est)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="kc-upload-hint border-t border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-[11px] sm:px-4">
        Yellow rows = unsaved edits · Est. price uses today&apos;s rates (MC/PC = flat MC + metal + GST)
      </p>
    </div>
  )
}
