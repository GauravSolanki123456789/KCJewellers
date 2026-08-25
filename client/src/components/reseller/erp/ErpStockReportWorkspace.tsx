'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'

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
  weight_ranges: { label: string; count: number }[]
  by_style: { style_code: string; count: number; total_weight_g: number; avg_weight_g: number; sku_count: number }[]
  by_sku: { style_code: string; sku: string; count: number; total_weight_g: number; avg_weight_g: number }[]
}

type StockPiece = {
  barcode: string
  style_code: string
  sku: string
  product_name: string
  size: string
  avg_weight: number
  purity: number | null
  mc_rate: number | null
  status: string
}

export function ErpStockReportWorkspace() {
  const [tree, setTree] = useState<DesignTree>([])
  const [reportType, setReportType] = useState<'detail' | 'summary'>('summary')
  const [styleCode, setStyleCode] = useState('')
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [status, setStatus] = useState('in_stock')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [summary, setSummary] = useState<StockSummary | null>(null)
  const [pieces, setPieces] = useState<StockPiece[]>([])

  useEffect(() => {
    void axios
      .get<{ tree: DesignTree }>('/api/reseller/erp/design-master/tree')
      .then((r) => setTree(r.data.tree || []))
      .catch(() => setTree([]))
  }, [])

  const styleSkus = useMemo(() => {
    const style = tree.find((s) => s.style_code === styleCode)
    return style?.skus || []
  }, [tree, styleCode])

  const onStyleChange = (code: string) => {
    setStyleCode(code)
    setSelectedSkus([])
  }

  const toggleSku = (sku: string) => {
    setSelectedSkus((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]))
  }

  const selectAllSkusInStyle = () => {
    setSelectedSkus(styleSkus.map((s) => s.sku))
  }

  const loadPreview = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      const params: Record<string, string> = {
        type: reportType,
        status,
      }
      if (styleCode) params.style_code = styleCode
      if (selectedSkus.length) params.skus = selectedSkus.join(',')
      const res = await axios.get<{ summary: StockSummary; pieces?: StockPiece[]; pieceCount: number }>(
        '/api/reseller/erp/shadow/stock-report',
        { params },
      )
      setSummary(res.data.summary)
      setPieces(res.data.pieces || [])
      setMsg(`Loaded ${res.data.pieceCount} piece(s).`)
    } catch (e) {
      setMsg(erpErr(e))
      setSummary(null)
      setPieces([])
    } finally {
      setBusy(false)
    }
  }, [reportType, styleCode, selectedSkus, status])

  const download = async (format: 'csv' | 'html') => {
    setBusy(true)
    try {
      const params: Record<string, string> = {
        type: reportType,
        format,
        status,
      }
      if (styleCode) params.style_code = styleCode
      if (selectedSkus.length) params.skus = selectedSkus.join(',')
      const res = await axios.get('/api/reseller/erp/shadow/stock-report', {
        params,
        responseType: format === 'csv' ? 'blob' : 'text',
      })
      if (format === 'html') {
        const w = window.open('', '_blank')
        if (w) {
          w.document.write(typeof res.data === 'string' ? res.data : '')
          w.document.close()
          w.focus()
          setTimeout(() => w.print(), 400)
        }
        setMsg('Print dialog opened — choose Save as PDF if needed.')
      } else {
        const blob = res.data instanceof Blob ? res.data : new Blob([String(res.data)])
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `stock-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        setMsg('Excel/CSV downloaded.')
      }
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Stock report</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            Style (optional)
            <select className={`${erpInputCls} mt-1`} value={styleCode} onChange={(e) => onStyleChange(e.target.value)}>
              <option value="">All styles</option>
              {tree.map((s) => (
                <option key={s.id} value={s.style_code}>
                  {s.style_code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Status
            <select className={`${erpInputCls} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="in_stock">In stock</option>
              <option value="sold">Sold</option>
              <option value="reserved">Reserved</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {styleCode && styleSkus.length ? (
          <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">SKU filter</p>
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--kc-accent,#c41e3a)] underline"
                onClick={selectAllSkusInStyle}
              >
                Select all in {styleCode}
              </button>
              {selectedSkus.length ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/50 underline"
                  onClick={() => setSelectedSkus([])}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {styleSkus.map((s) => {
                const on = selectedSkus.includes(s.sku)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`min-h-[36px] rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      on
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
                    }`}
                    onClick={() => toggleSku(s.sku)}
                  >
                    {s.sku}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
              Leave none selected to include all SKUs in the style.
            </p>
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
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void download('html')}>
            <FileText className="size-4" />
            PDF (print)
          </button>
        </div>
        {msg ? <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/65">{msg}</p> : null}
      </div>

      {summary ? (
        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Summary preview</p>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: 'Pieces', v: String(summary.total_pieces) },
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
              <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Weight ranges</p>
              <ul className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {summary.weight_ranges.map((r) => (
                  <li key={r.label} className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-1.5 text-xs">
                    <span className="font-medium">{r.label}</span>
                    <span className="ml-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/70">{r.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">By style</p>
              <div className="overflow-x-auto">
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
                        <td className="py-2 pr-2 font-medium">{s.style_code}</td>
                        <td className="py-2 pr-2 tabular-nums">{s.count}</td>
                        <td className="py-2 pr-2 tabular-nums">{s.total_weight_g}</td>
                        <td className="py-2 tabular-nums">{s.avg_weight_g}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : pieces.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/55">
                    <th className="py-2 pr-2">Barcode</th>
                    <th className="py-2 pr-2">Style</th>
                    <th className="py-2 pr-2">SKU</th>
                    <th className="py-2 pr-2">Wt (g)</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.slice(0, 200).map((p) => (
                    <tr key={p.barcode} className="border-b border-[var(--color-slate-700,#e8e4df)]/60">
                      <td className="py-1.5 pr-2 font-mono">{p.barcode}</td>
                      <td className="py-1.5 pr-2">{p.style_code}</td>
                      <td className="py-1.5 pr-2">{p.sku}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{p.avg_weight}</td>
                      <td className="py-1.5">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pieces.length > 200 ? (
                <p className="mt-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                  Showing first 200 of {pieces.length} — download for full list.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
