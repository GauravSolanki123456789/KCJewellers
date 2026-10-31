'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls, useErpFlash } from '@/components/reseller/erp/erp-ui'
import { downloadStockInHandPdf } from '@/lib/erp-stock-summary-pdf'

type DesignTree = {
  id: number
  style_code: string
  skus: { id: number; sku: string }[]
}[]

type StockSummary = {
  total_pieces: number
  total_pcs: number
  total_weight_g: number
  average_weight_g: number
  min_weight_g: number
  max_weight_g: number
  lane_reserved_count?: number
  lane_reserved_weight_g?: number
  available_count?: number
  weight_ranges: { label: string; count: number }[]
  by_style: { style_code: string; count: number; total_weight_g: number; avg_weight_g: number; sku_count: number }[]
  by_sku: { style_code: string; sku: string; count: number; total_weight_g: number; avg_weight_g: number }[]
  by_metal?: { metal_type: string; count: number; total_weight_g: number; avg_weight_g: number }[]
}

type StockPiece = {
  barcode: string
  style_code: string
  sku: string
  product_name: string
  size: string
  avg_weight: number
  gross_weight?: number | null
  purity: number | null
  wastage_pct?: number | null
  mc_rate: number | null
  mc_type?: string | null
  metal_type?: string
  item_code?: string | null
  rfid_tag?: string | null
  status: string
}

function statusFilterLabel(st: string) {
  if (st === 'in_stock') return 'Stock in hand'
  if (st === 'sold') return 'Billed / out of stock'
  if (st === 'all') return 'All pieces'
  return st
}

function pieceStatusLabel(st: string) {
  if (st === 'in_stock') return 'In stock'
  if (st === 'sold') return 'Sold'
  return st.replace(/_/g, ' ')
}

const METAL_OPTIONS = ['SILVER', 'GOLD']

function chipCls(on: boolean) {
  return `min-h-[40px] rounded-xl border px-3 py-2 text-xs font-semibold ${
    on
      ? 'border-emerald-700 bg-emerald-700 text-white'
      : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
  }`
}

export function ErpStockReportWorkspace() {
  const [tree, setTree] = useState<DesignTree>([])
  const [reportType, setReportType] = useState<'detail' | 'summary'>('summary')
  const [selectedMetals, setSelectedMetals] = useState<string[]>([])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [status, setStatus] = useState('in_stock')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useErpFlash()
  const [summary, setSummary] = useState<StockSummary | null>(null)
  const [pieces, setPieces] = useState<StockPiece[]>([])

  useEffect(() => {
    void axios
      .get<{ tree: DesignTree }>('/api/reseller/erp/design-master/tree')
      .then((r) => setTree(r.data.tree || []))
      .catch(() => setTree([]))
  }, [])

  useEffect(() => {
    setPieces([])
  }, [reportType])

  const styleByCode = useMemo(() => {
    const map = new Map<string, DesignTree[number]>()
    for (const s of tree) map.set(s.style_code, s)
    return map
  }, [tree])

  const skuOptions = useMemo(() => {
    const styles = selectedStyles.length ? selectedStyles : tree.map((s) => s.style_code)
    const out: { style: string; sku: string; id: string }[] = []
    for (const code of styles) {
      const row = styleByCode.get(code)
      for (const sk of row?.skus || []) {
        out.push({ style: code, sku: sk.sku, id: `${code}::${sk.sku}` })
      }
    }
    return out
  }, [selectedStyles, tree, styleByCode])

  const toggleMetal = (metal: string) => {
    setSelectedMetals((prev) => (prev.includes(metal) ? prev.filter((m) => m !== metal) : [...prev, metal]))
  }

  const skuKey = (style: string, sku: string) => `${style}::${sku}`

  const toggleStyle = (code: string) => {
    const style = styleByCode.get(code)
    const styleSkuKeys = (style?.skus || []).map((s) => skuKey(code, s.sku))
    setSelectedStyles((prev) => {
      const on = prev.includes(code)
      if (on) {
        setSelectedSkus((skus) => skus.filter((s) => !styleSkuKeys.includes(s)))
        return prev.filter((s) => s !== code)
      }
      setSelectedSkus((skus) => Array.from(new Set([...skus, ...styleSkuKeys])))
      return [...prev, code]
    })
  }

  const toggleSku = (key: string) => {
    setSelectedSkus((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  }

  const selectAllStyles = () => {
    const all = tree.map((s) => s.style_code)
    const allSkuKeys = tree.flatMap((s) => (s.skus || []).map((k) => skuKey(s.style_code, k.sku)))
    setSelectedStyles(all)
    setSelectedSkus(Array.from(new Set(allSkuKeys)))
  }

  const buildParams = useCallback(() => {
    const params: Record<string, string> = { type: reportType, status }
    if (selectedMetals.length) params.metals = selectedMetals.join(',')
    if (selectedStyles.length) params.style_codes = selectedStyles.join(',')
    const styleSkuSet = new Set(
      selectedStyles.flatMap((code) =>
        (styleByCode.get(code)?.skus || []).map((s) => `${code}::${s.sku}`),
      ),
    )
    const skuSubset =
      selectedStyles.length > 0 && selectedSkus.length > 0 && selectedSkus.length < styleSkuSet.size
    if (skuSubset || (!selectedStyles.length && selectedSkus.length)) {
      params.skus = selectedSkus.join(',')
    }
    return params
  }, [reportType, status, selectedMetals, selectedStyles, selectedSkus, styleByCode])

  const fetchSummary = useCallback(async () => {
    const res = await axios.get<{ summary: StockSummary; pieces?: StockPiece[]; pieceCount: number }>(
      '/api/reseller/erp/shadow/stock-report',
      { params: buildParams() },
    )
    return res.data
  }, [buildParams])

  const loadPreview = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const data = await fetchSummary()
      setSummary(data.summary)
      setPieces(data.pieces || [])
      setMsg(`Loaded ${data.pieceCount} piece(s) in hand.`)
    } catch (e) {
      setMsg(erpErr(e))
      setSummary(null)
      setPieces([])
    } finally {
      setBusy(false)
    }
  }, [fetchSummary])

  const buildFiltersLine = useCallback(() => {
    const parts: string[] = []
    if (selectedMetals.length) parts.push(`Metal: ${selectedMetals.join(', ')}`)
    if (selectedStyles.length) parts.push(`Style: ${selectedStyles.join(', ')}`)
    if (selectedSkus.length) {
      const skuLabels = selectedSkus.map((k) => k.replace('::', ' / '))
      if (skuLabels.length <= 6) parts.push(`SKU: ${skuLabels.join('; ')}`)
      else parts.push(`${skuLabels.length} SKU(s) selected`)
    }
    return parts.join(' · ') || 'All stock matching filters'
  }, [selectedMetals, selectedStyles, selectedSkus])

  const downloadPdf = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const data = await fetchSummary()
      setSummary(data.summary)
      if (reportType === 'detail') setPieces(data.pieces || [])
      await downloadStockInHandPdf({
        reportType,
        summary: data.summary,
        pieces: data.pieces || [],
        meta: {
          statusLabel: statusFilterLabel(status),
          filtersLine: buildFiltersLine(),
          generatedAt: new Date().toISOString(),
        },
      })
      setMsg(reportType === 'detail' ? `Detail PDF downloaded (${data.pieceCount} pieces).` : 'Summary PDF downloaded.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const download = async (format: 'csv') => {
    setBusy(true)
    try {
      const params = { ...buildParams(), format }
      const res = await axios.get('/api/reseller/erp/shadow/stock-report', {
        params,
        responseType: 'blob',
      })
      const blob = res.data instanceof Blob ? res.data : new Blob([String(res.data)])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock-in-hand-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setMsg('Excel/CSV downloaded.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="mb-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Stock in hand</p>
        <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Choose metal, then style (all SKUs under it are selected), then deselect any SKU you do not need.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Report type
            <select
              className={`${erpInputCls} mt-1`}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as 'detail' | 'summary')}
            >
              <option value="summary">Summary (totals, averages, ranges)</option>
              <option value="detail">Detailed (every piece)</option>
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Status
            <select className={`${erpInputCls} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="in_stock">Stock in hand</option>
              <option value="sold">Billed / out of stock</option>
              <option value="all">All pieces</option>
            </select>
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Metal</p>
          <div className="flex flex-wrap gap-2">
            {METAL_OPTIONS.map((m) => (
              <button key={m} type="button" className={chipCls(selectedMetals.includes(m))} onClick={() => toggleMetal(m)}>
                {m}
              </button>
            ))}
            {selectedMetals.length ? (
              <button type="button" className={`${erpBtnGhost} !min-h-[40px] text-[11px]`} onClick={() => setSelectedMetals([])}>
                All metals
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Style</p>
            <button type="button" className="text-[11px] font-medium text-emerald-800 underline" onClick={selectAllStyles}>
              Select all styles
            </button>
            {selectedStyles.length ? (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/50 underline"
                onClick={() => {
                  setSelectedStyles([])
                  setSelectedSkus([])
                }}
              >
                Clear styles
              </button>
            ) : null}
          </div>
          <div className="flex max-h-40 flex-wrap gap-2 overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-2">
            {tree.length ? (
              tree.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={chipCls(selectedStyles.includes(s.style_code))}
                  onClick={() => toggleStyle(s.style_code)}
                >
                  {s.style_code}
                  <span className="ml-1 opacity-70">({s.skus?.length || 0})</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">No styles in design master.</p>
            )}
          </div>
        </div>

        {skuOptions.length ? (
          <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">SKU</p>
              <button
                type="button"
                className="text-[11px] font-medium text-emerald-800 underline"
                onClick={() => setSelectedSkus(Array.from(new Set(skuOptions.map((s) => s.id))))}
              >
                Select all SKUs
              </button>
              {selectedSkus.length ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/50 underline"
                  onClick={() => setSelectedSkus([])}
                >
                  Clear SKUs
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {skuOptions.map((s) => {
                const on = selectedSkus.includes(s.id)
                return (
                  <button key={s.id} type="button" className={chipCls(on)} onClick={() => toggleSku(s.id)}>
                    <span className="opacity-60">{s.style}</span> · {s.sku}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void loadPreview()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Preview'}
          </button>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void download('csv')}>
            <FileSpreadsheet className="size-4" />
            Download Excel (CSV)
          </button>
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void downloadPdf()}>
            <FileText className="size-4" />
            PDF download
          </button>
        </div>
        {msg ? <p className="mt-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">{msg}</p> : null}
      </div>

      {summary ? (
        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Preview</p>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: 'In hand', v: String(summary.total_pieces) },
              ...(summary.lane_reserved_count
                ? [{ l: 'Billed (out)', v: String(summary.lane_reserved_count) }]
                : []),
              { l: 'Total weight', v: `${summary.total_weight_g} g` },
              { l: 'Avg weight', v: `${summary.average_weight_g} g` },
              { l: 'Min / Max', v: `${summary.min_weight_g} / ${summary.max_weight_g} g` },
            ].map((c) => (
              <div key={c.l} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{c.l}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{c.v}</p>
              </div>
            ))}
          </div>
          {reportType === 'summary' ? (
            <>
              {summary.by_metal?.length ? (
                <>
                  <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">By metal</p>
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full min-w-[360px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                          <th className="py-2 pr-2">Metal</th>
                          <th className="py-2 pr-2">Count</th>
                          <th className="py-2 pr-2">Total g</th>
                          <th className="py-2">Avg g</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_metal.map((s) => (
                          <tr key={s.metal_type} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                            <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.metal_type}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.total_weight_g}</td>
                            <td className="py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.avg_weight_g}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              {summary.by_sku.length ? (
                <>
                  <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">By SKU</p>
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                          <th className="py-2 pr-2">Style</th>
                          <th className="py-2 pr-2">SKU</th>
                          <th className="py-2 pr-2">Count</th>
                          <th className="py-2 pr-2">Total g</th>
                          <th className="py-2">Avg g</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_sku.map((s) => (
                          <tr key={`${s.style_code}-${s.sku}`} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                            <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.style_code}</td>
                            <td className="py-2 pr-2 text-[var(--color-jewelry-black,#1a1814)]">{s.sku}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.total_weight_g}</td>
                            <td className="py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.avg_weight_g}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">By style</p>
              <div className="mb-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="py-2 pr-2">Style</th>
                      <th className="py-2 pr-2">Count</th>
                      <th className="py-2 pr-2">Total g</th>
                      <th className="py-2">Avg g</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_style.map((s) => (
                      <tr key={s.style_code} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                        <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.style_code}</td>
                        <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                        <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.total_weight_g}</td>
                        <td className="py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.avg_weight_g}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : pieces.length ? (
            <div>
              <p className="mb-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                Every piece ({pieces.length}) — scroll for full list or use PDF/CSV download.
              </p>
              <div className="max-h-[min(520px,calc(100vh-12rem))] overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="sticky top-0 z-[1] bg-[var(--color-slate-900,#f7f4ef)]">
                    <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Barcode</th>
                      <th className="px-2 py-2">Metal</th>
                      <th className="px-2 py-2">Style</th>
                      <th className="px-2 py-2">SKU</th>
                      <th className="hidden px-2 py-2 sm:table-cell">Product</th>
                      <th className="px-2 py-2">Wt (g)</th>
                      <th className="hidden px-2 py-2 md:table-cell">Purity</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.map((p, i) => (
                      <tr key={p.barcode} className="border-b border-[var(--color-slate-700,#e8e4df)]/60 bg-white">
                        <td className="px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono text-[var(--color-jewelry-black,#1a1814)]">{p.barcode}</td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{p.metal_type || '—'}</td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{p.style_code}</td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{p.sku}</td>
                        <td className="hidden px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)] sm:table-cell">
                          {p.product_name || '—'}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{p.avg_weight}</td>
                        <td className="hidden px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)] md:table-cell">
                          {p.purity ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{pieceStatusLabel(p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">No pieces match these filters.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
