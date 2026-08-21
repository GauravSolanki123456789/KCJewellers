'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PricelistTreeCategory } from '@/lib/reseller-pricelist'
import { bulkSavePricelistProducts, formatSlabKeyLabel } from '@/lib/reseller-pricelist'
import { erpBtnGhost, erpBtnPrimary, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react'

export type PricelistEditRow = {
  key: string
  id?: number
  subcategory_name: string
  product_name: string
  avg_weight: string
  slab_rates: Record<string, string>
  _delete?: boolean
}

function rowsFromTree(treeCat: PricelistTreeCategory | undefined, slabKeys: string[]): PricelistEditRow[] {
  if (!treeCat) return []
  const out: PricelistEditRow[] = []
  for (const sc of treeCat.subcategories) {
    for (const p of sc.products) {
      const slab_rates: Record<string, string> = {}
      for (const k of slabKeys) {
        const v = p.slab_rates?.[k]
        slab_rates[k] = v != null && Number.isFinite(Number(v)) ? String(v) : ''
      }
      out.push({
        key: `p-${p.id}`,
        id: p.id,
        subcategory_name: sc.name,
        product_name: p.product_name,
        avg_weight: p.avg_weight != null ? String(p.avg_weight) : '',
        slab_rates,
      })
    }
  }
  return out
}

type Props = {
  categoryId: number
  categoryName: string
  treeCat: PricelistTreeCategory | undefined
  slabKeys: string[]
  onClose: () => void
  onSaved: () => void
}

export function PricelistSpreadsheetEditor({
  categoryId,
  categoryName,
  treeCat,
  slabKeys,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<PricelistEditRow[]>(() => rowsFromTree(treeCat, slabKeys))
  const [deletedIds, setDeletedIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setRows(rowsFromTree(treeCat, slabKeys))
    setDeletedIds([])
  }, [treeCat, slabKeys])

  const visibleRows = useMemo(() => rows.filter((r) => !r._delete), [rows])

  const updateRow = useCallback((key: string, patch: Partial<PricelistEditRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }, [])

  const updateSlab = useCallback((key: string, slabKey: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, slab_rates: { ...r.slab_rates, [slabKey]: value } } : r,
      ),
    )
  }, [])

  const addRow = () => {
    const sub = visibleRows[visibleRows.length - 1]?.subcategory_name || treeCat?.subcategories[0]?.name || ''
    const slab_rates: Record<string, string> = {}
    for (const k of slabKeys) slab_rates[k] = ''
    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        subcategory_name: sub,
        product_name: '',
        avg_weight: '',
        slab_rates,
      },
    ])
  }

  const markDelete = (row: PricelistEditRow) => {
    if (row.id) setDeletedIds((prev) => [...prev, row.id!])
    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, _delete: true } : r)))
  }

  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const products = visibleRows.map((r) => {
        const slab_rates: Record<string, number> = {}
        for (const [k, v] of Object.entries(r.slab_rates)) {
          const n = parseFloat(String(v).replace(/,/g, '').trim())
          if (Number.isFinite(n)) slab_rates[k] = n
        }
        const avgNum = parseFloat(String(r.avg_weight).replace(/,/g, '').trim())
        return {
          id: r.id,
          subcategory_name: r.subcategory_name.trim(),
          product_name: r.product_name.trim(),
          avg_weight: Number.isFinite(avgNum) ? avgNum : null,
          slab_rates,
        }
      })
      const res = await bulkSavePricelistProducts(categoryId, products, deletedIds)
      const parts = []
      if (res.updated) parts.push(`${res.updated} updated`)
      if (res.created) parts.push(`${res.created} added`)
      if (res.deleted) parts.push(`${res.deleted} removed`)
      setMessage(parts.length ? `Saved — ${parts.join(', ')}.` : 'Saved.')
      if (res.errors?.length) {
        setMessage((m) => `${m} ${res.errors!.length} row(s) had errors.`)
      }
      onSaved()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setMessage(msg || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-slate-900,#f7f4ef)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Edit pricelist — {categoryName}
          </p>
          <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
            Fix mistakes, change weights/MC slabs, or add new rows. Tap Save when done.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnGhost} onClick={addRow} disabled={busy}>
            <Plus className="size-4" />
            Add row
          </button>
          <button type="button" className={erpBtnPrimary} onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </button>
          <button type="button" className={erpBtnGhost} onClick={onClose} disabled={busy}>
            <X className="size-4" />
            Close
          </button>
        </div>
      </div>

      {message ? (
        <p className="shrink-0 border-b border-emerald-500/20 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
          {message}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-left text-xs">
            <thead>
              <tr className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                <th className="sticky left-0 z-10 bg-[var(--color-slate-900,#f7f4ef)] px-2 py-2">Subcategory</th>
                <th className="min-w-[120px] px-2 py-2">Product</th>
                <th className="w-20 px-2 py-2">Avg wt</th>
                {slabKeys.map((k) => (
                  <th key={k} className="w-16 px-2 py-2">
                    {formatSlabKeyLabel(k)}
                  </th>
                ))}
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={4 + slabKeys.length} className="px-4 py-8 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No products yet — tap Add row or upload Excel first.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.key} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="sticky left-0 z-[1] bg-white px-1 py-1">
                      <input
                        className={`${erpInputCls} min-h-[36px] text-xs`}
                        value={row.subcategory_name}
                        onChange={(e) => updateRow(row.key, { subcategory_name: e.target.value })}
                        placeholder="ANKLET"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className={`${erpInputCls} min-h-[36px] text-xs`}
                        value={row.product_name}
                        onChange={(e) => updateRow(row.key, { product_name: e.target.value })}
                        placeholder="Product name"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className={`${erpInputCls} min-h-[36px] text-xs`}
                        inputMode="decimal"
                        value={row.avg_weight}
                        onChange={(e) => updateRow(row.key, { avg_weight: e.target.value })}
                        placeholder="gm"
                      />
                    </td>
                    {slabKeys.map((k) => (
                      <td key={k} className="px-1 py-1">
                        <input
                          className={`${erpInputCls} min-h-[36px] text-xs`}
                          inputMode="decimal"
                          value={row.slab_rates[k] ?? ''}
                          onChange={(e) => updateSlab(row.key, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-rose-700"
                        title="Remove row"
                        onClick={() => markDelete(row)}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
