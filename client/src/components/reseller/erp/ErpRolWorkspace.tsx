'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  erpListItemSelected,
  erpListItemSelectedAlt,
} from '@/components/reseller/erp/erp-ui'
import { Download, Loader2, Plus, Save, Tags, Trash2, Wand2 } from 'lucide-react'

type DesignSku = { id: number; sku: string }
type DesignStyle = { id: number; style_code: string; skus: DesignSku[] }

type RolRange = {
  id?: number
  target_weight_g: number
  min_weight_g: number
  max_weight_g: number
  rol_qty: number
  available_qty?: number
  required_qty?: number
  label?: string
}

type DraftRange = {
  key: string
  target_weight_g: string
  min_weight_g: string
  max_weight_g: string
  rol_qty: string
}

function draftFromRange(r: RolRange): DraftRange {
  return {
    key: String(r.id ?? `${r.target_weight_g}-${r.min_weight_g}`),
    target_weight_g: String(r.target_weight_g),
    min_weight_g: String(r.min_weight_g),
    max_weight_g: String(r.max_weight_g),
    rol_qty: String(r.rol_qty ?? 0),
  }
}

export function ErpRolWorkspace() {
  const [tree, setTree] = useState<DesignStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null)
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<number>>(new Set())
  const [activeSkuId, setActiveSkuId] = useState<number | null>(null)
  const [draftRanges, setDraftRanges] = useState<DraftRange[]>([])
  const [liveRanges, setLiveRanges] = useState<RolRange[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [report, setReport] = useState<
    {
      style_code: string
      sku: string
      design_sku_id: number
      ranges: RolRange[]
      total_available: number
      total_required: number
    }[]
  >([])

  const reloadTree = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ tree: DesignStyle[] }>('/api/reseller/erp/design-master/tree')
      const t = res.data.tree || []
      setTree(t)
      if (!selectedStyleId && t[0]?.id) setSelectedStyleId(t[0].id)
    } catch {
      setTree([])
    } finally {
      setLoading(false)
    }
  }, [selectedStyleId])

  useEffect(() => {
    void reloadTree()
  }, [reloadTree])

  const selectedStyle = tree.find((s) => s.id === selectedStyleId) || null

  const loadRanges = useCallback(async (skuId: number) => {
    setErr(null)
    try {
      const res = await axios.get<{ ranges: RolRange[] }>('/api/reseller/erp/rol/ranges', {
        params: { sku_id: skuId },
      })
      const ranges = res.data.ranges || []
      setLiveRanges(ranges)
      setDraftRanges(ranges.map(draftFromRange))
    } catch (e) {
      setLiveRanges([])
      setDraftRanges([])
      setErr(erpErr(e))
    }
  }, [])

  useEffect(() => {
    if (activeSkuId) void loadRanges(activeSkuId)
  }, [activeSkuId, loadRanges])

  const toggleSku = (id: number) => {
    setSelectedSkuIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const saveRanges = async () => {
    if (!activeSkuId || busy) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const ranges = draftRanges
        .map((d) => ({
          target_weight_g: Number(d.target_weight_g),
          min_weight_g: Number(d.min_weight_g),
          max_weight_g: Number(d.max_weight_g),
          rol_qty: parseInt(d.rol_qty, 10) || 0,
        }))
        .filter((r) => Number.isFinite(r.target_weight_g) && Number.isFinite(r.min_weight_g) && Number.isFinite(r.max_weight_g))
      const res = await axios.put<{ ranges: RolRange[] }>('/api/reseller/erp/rol/ranges', {
        design_sku_id: activeSkuId,
        ranges,
      })
      setLiveRanges(res.data.ranges || [])
      setDraftRanges((res.data.ranges || []).map(draftFromRange))
      setMsg('ROL ranges saved.')
      await refreshReport()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const generateStandard = async () => {
    if (!activeSkuId || busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.post<{ ranges: RolRange[] }>('/api/reseller/erp/rol/ranges/standard', {
        design_sku_id: activeSkuId,
      })
      setLiveRanges(res.data.ranges || [])
      setDraftRanges((res.data.ranges || []).map(draftFromRange))
      setMsg('Standard weight ranges added — set ROL for each row and Save.')
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const refreshReport = useCallback(async () => {
    try {
      const params: Record<string, string> = {}
      if (selectedStyleId) params.style_id = String(selectedStyleId)
      if (selectedSkuIds.size) params.sku_ids = Array.from(selectedSkuIds).join(',')
      const res = await axios.get<{ report: typeof report }>('/api/reseller/erp/rol/report', { params })
      setReport(res.data.report || [])
    } catch {
      setReport([])
    }
  }, [selectedSkuIds, selectedStyleId])

  useEffect(() => {
    void refreshReport()
  }, [refreshReport, liveRanges])

  const downloadReport = async () => {
    const params = new URLSearchParams()
    if (selectedStyleId) params.set('style_id', String(selectedStyleId))
    if (selectedSkuIds.size) params.set('sku_ids', Array.from(selectedSkuIds).join(','))
    const url = `/api/reseller/erp/rol/export?${params.toString()}`
    const res = await axios.get(url, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rol-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const summaryRequired = useMemo(
    () => report.reduce((s, r) => s + (r.total_required || 0), 0),
    [report],
  )

  if (loading) {
    return (
      <div className={`${erpCardCls} flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55`}>
        <Loader2 className="size-4 animate-spin" />
        Loading design master…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} space-y-2`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Tags className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Reorder levels by weight range
        </p>
        <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Pick a style and SKU, define weight bins (e.g. 50 g = 45–54 g), set ROL per bin. Available counts use
          in-stock pieces only — sold and Jainav lane stock are excluded.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${erpCardCls} space-y-2 lg:col-span-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            Styles
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {tree.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    s.id === selectedStyleId ? erpListItemSelected : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                  }`}
                  onClick={() => {
                    setSelectedStyleId(s.id)
                    setSelectedSkuIds(new Set())
                    setActiveSkuId(null)
                  }}
                >
                  {s.style_code}
                  <span className="ml-1 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    ({s.skus.length} SKU)
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${erpCardCls} space-y-2 lg:col-span-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            SKUs — select for report
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {(selectedStyle?.skus || []).map((sk) => (
              <li key={sk.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSkuIds.has(sk.id)}
                  onChange={() => toggleSku(sk.id)}
                  className="size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
                />
                <button
                  type="button"
                  className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left text-sm ${
                    sk.id === activeSkuId ? erpListItemSelectedAlt : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                  }`}
                  onClick={() => setActiveSkuId(sk.id)}
                >
                  {sk.sku}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${erpCardCls} space-y-3 lg:col-span-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            Weight ranges {activeSkuId ? '' : '— select a SKU'}
          </p>
          {activeSkuId ? (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void generateStandard()}>
                  <Wand2 className="size-4" />
                  Standard ranges
                </button>
                <button
                  type="button"
                  className={erpBtnGhost}
                  onClick={() =>
                    setDraftRanges((prev) => [
                      ...prev,
                      {
                        key: `new-${Date.now()}`,
                        target_weight_g: '',
                        min_weight_g: '',
                        max_weight_g: '',
                        rol_qty: '0',
                      },
                    ])
                  }
                >
                  <Plus className="size-4" />
                  Add range
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b bg-[var(--color-slate-900,#faf8f4)] text-left text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-2 py-1.5">Target g</th>
                      <th className="px-2 py-1.5">Min</th>
                      <th className="px-2 py-1.5">Max</th>
                      <th className="px-2 py-1.5">ROL</th>
                      <th className="px-2 py-1.5">Avail</th>
                      <th className="px-2 py-1.5">Need</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {draftRanges.map((d, i) => {
                      const live = liveRanges[i]
                      return (
                        <tr key={d.key} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.target_weight_g}
                              onChange={(e) =>
                                setDraftRanges((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, target_weight_g: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.min_weight_g}
                              onChange={(e) =>
                                setDraftRanges((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, min_weight_g: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.max_weight_g}
                              onChange={(e) =>
                                setDraftRanges((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, max_weight_g: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.rol_qty}
                              onChange={(e) =>
                                setDraftRanges((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, rol_qty: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1 tabular-nums text-emerald-700">{live?.available_qty ?? '—'}</td>
                          <td className="px-2 py-1 tabular-nums text-rose-600">{live?.required_qty ?? '—'}</td>
                          <td className="p-1">
                            <button
                              type="button"
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                              onClick={() => setDraftRanges((prev) => prev.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveRanges()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save ROL
              </button>
            </>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Select a SKU to edit weight ranges.</p>
          )}
        </div>
      </div>

      <div className={`${erpCardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">ROL report</p>
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              {report.length} SKU(s) · {summaryRequired} piece(s) required to order
            </p>
          </div>
          <button type="button" className={erpBtnGhost} onClick={() => void downloadReport()}>
            <Download className="size-4" />
            Download CSV
          </button>
        </div>
        {report.length === 0 ? (
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No ROL ranges configured yet. Select SKUs and save weight ranges above.
          </p>
        ) : (
          <div className="space-y-4">
            {report.map((block) => (
              <div key={block.design_sku_id} className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <p className="border-b bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {block.style_code} · {block.sku}
                  <span className="ml-2 text-xs font-normal text-rose-600">
                    Need {block.total_required} pc(s)
                  </span>
                </p>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-3 py-2">Weight range</th>
                      <th className="px-3 py-2">Available</th>
                      <th className="px-3 py-2">ROL</th>
                      <th className="px-3 py-2">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.ranges.map((r) => (
                      <tr
                        key={`${block.design_sku_id}-${r.target_weight_g}`}
                        className={`border-t border-[var(--color-slate-700,#e8e4df)]/50 ${
                          (r.required_qty || 0) > 0 ? 'bg-rose-50/40' : ''
                        }`}
                      >
                        <td className="px-3 py-2">{r.label}</td>
                        <td className="px-3 py-2 tabular-nums">{r.available_qty}</td>
                        <td className="px-3 py-2 tabular-nums">{r.rol_qty}</td>
                        <td className="px-3 py-2 tabular-nums font-semibold text-rose-700">{r.required_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-xs font-medium text-rose-600">{err}</p> : null}
    </div>
  )
}
