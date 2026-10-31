'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls, useErpFlash } from '@/components/reseller/erp/erp-ui'
import { downloadProfitsPdf, type ProfitSummaryPdf } from '@/lib/erp-profits-pdf'
import { formatErpInr } from '@/lib/reseller-erp-modules'

type DesignTree = {
  id: number
  style_code: string
  skus: { id: number; sku: string }[]
}[]

type ProfitRow = {
  barcode: string
  bill_number: string
  bill_date: string | null
  pv_number: string
  style_code: string
  sku: string
  product_name: string
  metal_type: string
  avg_weight: number
  pv_rate: number
  sold_rate: number
  cost_metal_pct: number
  sold_metal_pct: number
  cost_total: number
  sold_taxable: number
  gst_inr: number
  profit: number
}

const METAL_OPTIONS = ['SILVER', 'GOLD']

function chipCls(on: boolean) {
  return `min-h-[40px] rounded-xl border px-3 py-2 text-xs font-semibold ${
    on
      ? 'border-emerald-700 bg-emerald-700 text-white'
      : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
  }`
}

function pctLabel(v: number) {
  if (!Number.isFinite(v) || v <= 0) return '—'
  const pct = v > 1 ? v : v * 100
  return `${Math.round(pct * 100) / 100}%`
}

export function ErpProfitsWorkspace() {
  const [tree, setTree] = useState<DesignTree>([])
  const [reportType, setReportType] = useState<'detail' | 'summary'>('summary')
  const [selectedMetals, setSelectedMetals] = useState<string[]>([])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useErpFlash()
  const [summary, setSummary] = useState<ProfitSummaryPdf | null>(null)
  const [pieces, setPieces] = useState<ProfitRow[]>([])

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

  const skuKey = (style: string, sku: string) => `${style}::${sku}`

  const toggleMetal = (metal: string) => {
    setSelectedMetals((prev) => (prev.includes(metal) ? prev.filter((m) => m !== metal) : [...prev, metal]))
  }

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
    const params: Record<string, string> = { type: reportType }
    if (selectedMetals.length) params.metals = selectedMetals.join(',')
    if (selectedStyles.length) params.style_codes = selectedStyles.join(',')
    const styleSkuSet = new Set(
      selectedStyles.flatMap((code) => (styleByCode.get(code)?.skus || []).map((s) => `${code}::${s.sku}`)),
    )
    const skuSubset =
      selectedStyles.length > 0 && selectedSkus.length > 0 && selectedSkus.length < styleSkuSet.size
    if (skuSubset || (!selectedStyles.length && selectedSkus.length)) {
      params.skus = selectedSkus.join(',')
    }
    if (from) params.from = from
    if (to) params.to = to
    return params
  }, [reportType, selectedMetals, selectedStyles, selectedSkus, styleByCode, from, to])

  const fetchSummary = useCallback(async () => {
    const res = await axios.get<{ summary: ProfitSummaryPdf; pieces?: ProfitRow[]; pieceCount: number }>(
      '/api/reseller/erp/profits',
      { params: buildParams() },
    )
    return res.data
  }, [buildParams])

  const buildFiltersLine = useCallback(() => {
    const parts: string[] = []
    if (selectedMetals.length) parts.push(`Metal: ${selectedMetals.join(', ')}`)
    if (selectedStyles.length) parts.push(`Style: ${selectedStyles.join(', ')}`)
    if (selectedSkus.length) {
      const skuLabels = selectedSkus.map((k) => k.replace('::', ' / '))
      if (skuLabels.length <= 6) parts.push(`SKU: ${skuLabels.join('; ')}`)
      else parts.push(`${skuLabels.length} SKU(s) selected`)
    }
    if (from || to) parts.push(`Date: ${from || '…'} → ${to || '…'}`)
    return parts.join(' · ') || 'All sold stock matching filters'
  }, [selectedMetals, selectedStyles, selectedSkus, from, to])

  const loadPreview = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const data = await fetchSummary()
      setSummary(data.summary)
      setPieces(data.pieces || [])
      setMsg(`Loaded ${data.pieceCount} sold piece(s).`)
    } catch (e) {
      setMsg(erpErr(e))
      setSummary(null)
      setPieces([])
    } finally {
      setBusy(false)
    }
  }, [fetchSummary])

  const downloadPdf = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const data = await fetchSummary()
      setSummary(data.summary)
      if (reportType === 'detail') setPieces(data.pieces || [])
      await downloadProfitsPdf({
        reportType,
        summary: data.summary,
        pieces: data.pieces || [],
        filtersLine: buildFiltersLine(),
        generatedAt: new Date().toISOString(),
      })
      setMsg(reportType === 'detail' ? `Detail PDF downloaded (${data.pieceCount} pieces).` : 'Summary PDF downloaded.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const downloadCsv = async () => {
    setBusy(true)
    try {
      const res = await axios.get('/api/reseller/erp/profits', {
        params: { ...buildParams(), format: 'csv' },
        responseType: 'blob',
      })
      const blob = res.data instanceof Blob ? res.data : new Blob([String(res.data)])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `profits-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
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
        <p className="mb-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Profits</p>
        <p className="mb-3 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Choose metal, then style (all SKUs under it are selected), then deselect any SKU you do not need. Profit uses
          PV rate × design Metal%Cost versus sold rate × sold metal %, plus MC / wastage / MRP cost from design master.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Report type
            <select
              className={`${erpInputCls} mt-1`}
              value={reportType}
              onChange={(e) => setReportType(e.target.value as 'detail' | 'summary')}
            >
              <option value="summary">Summary (style / SKU totals)</option>
              <option value="detail">Detailed (every sold piece)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              From
              <input className={`${erpInputCls} mt-1`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              To
              <input className={`${erpInputCls} mt-1`} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
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
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void downloadCsv()}>
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
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { l: 'Sold pcs', v: String(summary.total_pieces) },
              { l: 'Weight', v: `${summary.total_weight_g} g` },
              { l: 'Sold (ex GST)', v: formatErpInr(summary.sold_taxable) },
              { l: 'Cost', v: formatErpInr(summary.cost_total) },
              { l: 'GST', v: formatErpInr(summary.gst_inr) },
              { l: 'Profit', v: formatErpInr(summary.profit) },
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
                          <th className="py-2 pr-2">Pcs</th>
                          <th className="py-2 pr-2">Sold</th>
                          <th className="py-2">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_metal.map((s) => (
                          <tr key={s.metal_type} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                            <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.metal_type}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                              {formatErpInr(s.sold_taxable)}
                            </td>
                            <td className="py-2 tabular-nums font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                              {formatErpInr(s.profit)}
                            </td>
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
                    <table className="w-full min-w-[520px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                          <th className="py-2 pr-2">Style</th>
                          <th className="py-2 pr-2">SKU</th>
                          <th className="py-2 pr-2">Pcs</th>
                          <th className="py-2 pr-2">Sold</th>
                          <th className="py-2 pr-2">Cost</th>
                          <th className="py-2">Profit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.by_sku.map((s) => (
                          <tr key={`${s.style_code}-${s.sku}`} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                            <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.style_code}</td>
                            <td className="py-2 pr-2 text-[var(--color-jewelry-black,#1a1814)]">{s.sku}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                              {formatErpInr(s.sold_taxable)}
                            </td>
                            <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                              {formatErpInr(s.cost_total)}
                            </td>
                            <td className="py-2 tabular-nums font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                              {formatErpInr(s.profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">By style</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="py-2 pr-2">Style</th>
                      <th className="py-2 pr-2">Pcs</th>
                      <th className="py-2 pr-2">Sold</th>
                      <th className="py-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.by_style.map((s) => (
                      <tr key={s.style_code} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                        <td className="py-2 pr-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">{s.style_code}</td>
                        <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{s.count}</td>
                        <td className="py-2 pr-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                          {formatErpInr(s.sold_taxable)}
                        </td>
                        <td className="py-2 tabular-nums font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {formatErpInr(s.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : pieces.length ? (
            <div>
              <p className="mb-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                Every sold piece ({pieces.length}) — scroll for full list or use PDF/CSV download.
              </p>
              <div className="max-h-[min(520px,calc(100vh-12rem))] overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="sticky top-0 z-[1] bg-[var(--color-slate-900,#f7f4ef)]">
                    <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Barcode</th>
                      <th className="px-2 py-2">Bill</th>
                      <th className="hidden px-2 py-2 sm:table-cell">Style</th>
                      <th className="px-2 py-2">SKU</th>
                      <th className="px-2 py-2">Wt</th>
                      <th className="hidden px-2 py-2 md:table-cell">PV / sold</th>
                      <th className="hidden px-2 py-2 lg:table-cell">Metal %</th>
                      <th className="px-2 py-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.map((p, i) => (
                      <tr key={`${p.barcode}-${i}`} className="border-b border-[var(--color-slate-700,#e8e4df)]/60 bg-white">
                        <td className="px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono text-[var(--color-jewelry-black,#1a1814)]">{p.barcode}</td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{p.bill_number || '—'}</td>
                        <td className="hidden px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)] sm:table-cell">
                          {p.style_code}
                        </td>
                        <td className="px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]">{p.sku}</td>
                        <td className="px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{p.avg_weight}</td>
                        <td className="hidden px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)] md:table-cell">
                          {p.pv_rate || '—'} / {p.sold_rate || '—'}
                        </td>
                        <td className="hidden px-2 py-1.5 tabular-nums text-[var(--color-jewelry-black,#1a1814)] lg:table-cell">
                          {pctLabel(p.cost_metal_pct)} → {pctLabel(p.sold_metal_pct)}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {formatErpInr(p.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">No sold pieces match these filters.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
