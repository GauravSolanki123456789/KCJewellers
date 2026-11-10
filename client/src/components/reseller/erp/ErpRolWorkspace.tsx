'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  useErpErrorFlash,
  useErpFlash,
} from '@/components/reseller/erp/erp-ui'
import { Download, FileSpreadsheet, FileText, Loader2, Plus, Save, Tags, Trash2, Upload, Wand2 } from 'lucide-react'
import { downloadRolReportPdf } from '@/lib/erp-rol-report-pdf'
import { ErpRolExcelBuilder } from '@/components/reseller/erp/ErpRolExcelBuilder'
import {
  downloadRolReportWorkbook,
  parseRolExcelBuffer,
  type RolExportRow,
} from '@/lib/erp-rol-excel'

type DesignSku = { id: number; sku: string }
type DesignStyle = { id: number; style_code: string; skus: DesignSku[] }

type CatalogSku = {
  sku: string
  design_sku_id: number | null
  sizes: string[]
  products: string[]
  has_weight_ranges: boolean
  has_size_targets: boolean
}
type CatalogStyle = { style_code: string; skus: CatalogSku[] }

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

type SizeTargetRow = {
  id?: number
  style_code: string
  sku: string
  product_name: string
  size: string
  rol_wt_g: number
  rol_qty: number
  available_wt: number
  available_qty: number
  required_wt: number
  required_qty: number
}

type DraftSize = {
  key: string
  product_name: string
  size: string
  rol_wt_g: string
}

type WeightBlock = {
  style_code: string
  sku: string
  design_sku_id: number
  ranges: RolRange[]
  total_available: number
  total_required: number
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

function skuKey(style: string, sku: string) {
  return `${String(style).toUpperCase()}::${String(sku).toUpperCase()}`
}

function chipCls(on: boolean) {
  return `min-h-[40px] rounded-xl border px-3 py-2 text-xs font-semibold ${
    on
      ? 'border-emerald-700 bg-emerald-700 text-white'
      : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
  }`
}

export function ErpRolWorkspace() {
  const [designTree, setDesignTree] = useState<DesignStyle[]>([])
  const [catalog, setCatalog] = useState<CatalogStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedSkuKeys, setSelectedSkuKeys] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [activeStyle, setActiveStyle] = useState<string | null>(null)
  const [activeSku, setActiveSku] = useState<string | null>(null)
  const [draftRanges, setDraftRanges] = useState<DraftRange[]>([])
  const [liveRanges, setLiveRanges] = useState<RolRange[]>([])
  const [draftSizes, setDraftSizes] = useState<DraftSize[]>([])
  const [liveSizes, setLiveSizes] = useState<SizeTargetRow[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useErpFlash()
  const [err, setErr] = useErpErrorFlash()
  const [report, setReport] = useState<WeightBlock[]>([])
  const [sizeReport, setSizeReport] = useState<SizeTargetRow[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const reloadCatalog = useCallback(async () => {
    try {
      const [cat, tree] = await Promise.all([
        axios.get<{ tree: CatalogStyle[] }>('/api/reseller/erp/rol/catalog'),
        axios.get<{ tree: DesignStyle[] }>('/api/reseller/erp/design-master/tree'),
      ])
      setCatalog(cat.data.tree || [])
      setDesignTree(tree.data.tree || [])
    } catch {
      setCatalog([])
      setDesignTree([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reloadCatalog()
  }, [reloadCatalog])

  const styleByCode = useMemo(() => {
    const map = new Map<string, CatalogStyle>()
    for (const s of catalog) map.set(s.style_code, s)
    return map
  }, [catalog])

  const skuOptions = useMemo(() => {
    const styles = selectedStyles.length ? selectedStyles : catalog.map((s) => s.style_code)
    const out: { style: string; sku: string; id: string; design_sku_id: number | null }[] = []
    for (const code of styles) {
      const row = styleByCode.get(code)
      for (const sk of row?.skus || []) {
        out.push({
          style: code,
          sku: sk.sku,
          id: skuKey(code, sk.sku),
          design_sku_id: sk.design_sku_id,
        })
      }
    }
    return out
  }, [selectedStyles, catalog, styleByCode])

  const sizeOptions = useMemo(() => {
    const set = new Set<string>()
    const styles = selectedStyles.length ? selectedStyles : catalog.map((s) => s.style_code)
    for (const code of styles) {
      for (const sk of styleByCode.get(code)?.skus || []) {
        const key = skuKey(code, sk.sku)
        if (selectedSkuKeys.length && !selectedSkuKeys.includes(key)) continue
        for (const sz of sk.sizes || []) if (sz) set.add(sz)
      }
    }
    return [...set].sort((a, b) => {
      const na = Number(a)
      const nb = Number(b)
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
      return a.localeCompare(b)
    })
  }, [catalog, selectedStyles, selectedSkuKeys, styleByCode])

  const toggleStyle = (code: string) => {
    const style = styleByCode.get(code)
    const styleSkuKeys = (style?.skus || []).map((s) => skuKey(code, s.sku))
    setSelectedStyles((prev) => {
      const on = prev.includes(code)
      if (on) {
        setSelectedSkuKeys((skus) => skus.filter((s) => !styleSkuKeys.includes(s)))
        return prev.filter((s) => s !== code)
      }
      setSelectedSkuKeys((skus) => Array.from(new Set([...skus, ...styleSkuKeys])))
      return [...prev, code]
    })
  }

  const selectAllStyles = () => {
    const all = catalog.map((s) => s.style_code)
    const allSkuKeys = catalog.flatMap((s) => (s.skus || []).map((k) => skuKey(s.style_code, k.sku)))
    setSelectedStyles(all)
    setSelectedSkuKeys(Array.from(new Set(allSkuKeys)))
  }

  const toggleSkuChip = (key: string) => {
    setSelectedSkuKeys((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  }

  const toggleSizeChip = (sz: string) => {
    setSelectedSizes((prev) => (prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]))
  }

  const activeCatalogSku = useMemo(() => {
    if (!activeStyle || !activeSku) return null
    return styleByCode.get(activeStyle)?.skus.find((s) => s.sku === activeSku) || null
  }, [activeStyle, activeSku, styleByCode])

  const activeDesignSkuId = activeCatalogSku?.design_sku_id || null

  const loadRanges = useCallback(async (skuId: number) => {
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
  }, [setErr])

  const loadSizeDrafts = useCallback(
    async (style: string, sku: string) => {
      try {
        const res = await axios.get<{ rows: SizeTargetRow[] }>('/api/reseller/erp/rol/size-targets', {
          params: { style_code: style, sku },
        })
        const rows = res.data.rows || []
        setLiveSizes(rows)
        setDraftSizes(
          rows.map((r) => ({
            key: String(r.id ?? `${r.product_name}-${r.size}`),
            product_name: r.product_name || '',
            size: r.size || '',
            rol_wt_g: String(r.rol_wt_g ?? 0),
          })),
        )
      } catch (e) {
        setLiveSizes([])
        setDraftSizes([])
        setErr(erpErr(e))
      }
    },
    [setErr],
  )

  useEffect(() => {
    if (activeDesignSkuId) void loadRanges(activeDesignSkuId)
    else {
      setLiveRanges([])
      setDraftRanges([])
    }
  }, [activeDesignSkuId, loadRanges])

  useEffect(() => {
    if (activeStyle && activeSku) void loadSizeDrafts(activeStyle, activeSku)
    else {
      setLiveSizes([])
      setDraftSizes([])
    }
  }, [activeStyle, activeSku, loadSizeDrafts])

  const saveRanges = async () => {
    if (!activeDesignSkuId || busy) return
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
        design_sku_id: activeDesignSkuId,
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

  const saveSizeTargets = async () => {
    if (!activeStyle || !activeSku || busy) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const rows = draftSizes
        .map((d) => ({
          product_name: d.product_name.trim(),
          size: d.size.trim(),
          rol_wt_g: Number(d.rol_wt_g) || 0,
        }))
        .filter((r) => r.product_name || r.size || r.rol_wt_g > 0)
      const res = await axios.put<{ rows: SizeTargetRow[] }>('/api/reseller/erp/rol/size-targets', {
        style_code: activeStyle,
        sku: activeSku,
        rows,
      })
      setLiveSizes(res.data.rows || [])
      setDraftSizes(
        (res.data.rows || []).map((r) => ({
          key: String(r.id ?? `${r.product_name}-${r.size}`),
          product_name: r.product_name || '',
          size: r.size || '',
          rol_wt_g: String(r.rol_wt_g ?? 0),
        })),
      )
      setMsg('Size ROL saved.')
      await reloadCatalog()
      await refreshReport()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const generateStandard = async () => {
    if (!activeDesignSkuId || busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.post<{ ranges: RolRange[] }>('/api/reseller/erp/rol/ranges/standard', {
        design_sku_id: activeDesignSkuId,
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

  const reportParams = useMemo(() => {
    const params: Record<string, string> = {}
    if (selectedStyles.length) params.style_codes = selectedStyles.join(',')
    const styleSkuSet = new Set(
      selectedStyles.flatMap((code) => (styleByCode.get(code)?.skus || []).map((s) => skuKey(code, s.sku))),
    )
    const skuSubset =
      selectedStyles.length > 0 && selectedSkuKeys.length > 0 && selectedSkuKeys.length < styleSkuSet.size
    if (skuSubset || (!selectedStyles.length && selectedSkuKeys.length)) {
      params.sku_keys = selectedSkuKeys.join(',')
    }
    if (selectedSizes.length) params.sizes = selectedSizes.join(',')
    return params
  }, [selectedStyles, selectedSkuKeys, selectedSizes, styleByCode])

  const refreshReport = useCallback(async () => {
    try {
      const res = await axios.get<{ report: WeightBlock[]; size_report: SizeTargetRow[] }>(
        '/api/reseller/erp/rol/report',
        { params: reportParams },
      )
      setReport(res.data.report || [])
      setSizeReport(res.data.size_report || [])
    } catch {
      setReport([])
      setSizeReport([])
    }
  }, [reportParams])

  useEffect(() => {
    void refreshReport()
  }, [refreshReport, liveRanges, liveSizes])

  const downloadReportCsv = async () => {
    const qs = new URLSearchParams(reportParams).toString()
    const res = await axios.get(`/api/reseller/erp/rol/export?${qs}`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rol-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const downloadReportExcel = () => {
    const hasWeight = report.length > 0
    const hasSize = sizeReport.length > 0
    const rows: RolExportRow[] = []
    if (hasWeight) {
      for (const block of report) {
        for (const r of block.ranges) {
          rows.push({
            Style: block.style_code,
            SKU: block.sku,
            'Weight range': r.label || '',
            Available: r.available_qty ?? 0,
            'ROL set': r.rol_qty,
            Required: r.required_qty ?? 0,
            ...(hasSize
              ? {
                  'Product Name': '',
                  Size: '',
                  'Available WT': '',
                  'ROL WT set': '',
                  RequiredWT: '',
                }
              : {}),
          })
        }
      }
    }
    if (hasSize) {
      for (const r of sizeReport) {
        rows.push({
          Style: r.style_code,
          SKU: r.sku,
          'Product Name': r.product_name || '',
          Size: r.size || '',
          'Available WT': r.available_wt,
          'ROL WT set': r.rol_wt_g,
          RequiredWT: r.required_wt,
          ...(hasWeight
            ? {
                'Weight range': '',
                Available: r.available_qty || '',
                'ROL set': r.rol_qty || '',
                Required: r.required_qty || '',
              }
            : {}),
        })
      }
    }
    const mode = hasWeight && hasSize ? 'both' : hasSize ? 'size' : 'weight'
    downloadRolReportWorkbook(rows, `rol-report-${new Date().toISOString().slice(0, 10)}.xlsx`, mode)
  }

  const downloadReportPdf = async () => {
    if (!report.length && !sizeReport.length) return
    try {
      await downloadRolReportPdf(report, sizeReport)
      setMsg('ROL report PDF opened.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'PDF download failed')
    }
  }

  const onUploadExcel = async (file: File) => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseRolExcelBuffer(buf)
      if (!parsed.sizeRows.length && !parsed.weightRows.length) {
        throw new Error('No ROL rows found. Need Style + SKU, plus Size / ROL WT set or a weight range.')
      }
      const res = await axios.post<{
        size_upserted: number
        weight_imported: number
        weight_skipped: number
      }>('/api/reseller/erp/rol/import', {
        size_rows: parsed.sizeRows,
        weight_rows: parsed.weightRows,
      })
      setMsg(
        `Imported ${res.data.size_upserted} size/product row(s)` +
          (res.data.weight_imported ? ` · ${res.data.weight_imported} weight-range row(s)` : '') +
          (res.data.weight_skipped ? ` · ${res.data.weight_skipped} weight row(s) skipped (SKU not in design master)` : '') +
          '.',
      )
      await reloadCatalog()
      await refreshReport()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const summaryRequired = useMemo(
    () => report.reduce((s, r) => s + (r.total_required || 0), 0),
    [report],
  )
  const summaryRequiredWt = useMemo(
    () => sizeReport.reduce((s, r) => s + (Number(r.required_wt) || 0), 0),
    [sizeReport],
  )

  const editorStyles = catalog.length ? catalog : designTree.map((s) => ({
    style_code: s.style_code,
    skus: s.skus.map((k) => ({
      sku: k.sku,
      design_sku_id: k.id,
      sizes: [] as string[],
      products: [] as string[],
      has_weight_ranges: false,
      has_size_targets: false,
    })),
  }))

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
          Reorder levels
        </p>
      </div>

      <div className={erpCardCls}>
        <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Upload ROL Excel</p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUploadExcel(f)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload Excel
          </button>
        </div>
      </div>

      <ErpRolExcelBuilder />

      <div className={erpCardCls}>
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
                setSelectedSkuKeys([])
                setSelectedSizes([])
              }}
            >
              Clear styles
            </button>
          ) : null}
        </div>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-2">
          {catalog.length ? (
            catalog.map((s) => (
              <button
                key={s.style_code}
                type="button"
                className={chipCls(selectedStyles.includes(s.style_code))}
                onClick={() => toggleStyle(s.style_code)}
              >
                {s.style_code}
                <span className="ml-1 opacity-70">({s.skus?.length || 0})</span>
              </button>
            ))
          ) : (
            <p className="px-2 py-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
              No styles yet. Upload a ROL Excel or add SKUs in Design master.
            </p>
          )}
        </div>

        {skuOptions.length ? (
          <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">SKU</p>
              <button
                type="button"
                className="text-[11px] font-medium text-emerald-800 underline"
                onClick={() => setSelectedSkuKeys(Array.from(new Set(skuOptions.map((s) => s.id))))}
              >
                Select all SKUs
              </button>
              {selectedSkuKeys.length ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/50 underline"
                  onClick={() => setSelectedSkuKeys([])}
                >
                  Clear SKUs
                </button>
              ) : null}
            </div>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
              {skuOptions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={chipCls(selectedSkuKeys.includes(s.id))}
                  onClick={() => toggleSkuChip(s.id)}
                >
                  <span className="opacity-70">{s.style}</span> · {s.sku}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {sizeOptions.length ? (
          <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Size</p>
              <button
                type="button"
                className="text-[11px] font-medium text-emerald-800 underline"
                onClick={() => setSelectedSizes(sizeOptions)}
              >
                Select all sizes
              </button>
              {selectedSizes.length ? (
                <button
                  type="button"
                  className="text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/50 underline"
                  onClick={() => setSelectedSizes([])}
                >
                  Clear sizes
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((sz) => (
                <button key={sz} type="button" className={chipCls(selectedSizes.includes(sz))} onClick={() => toggleSizeChip(sz)}>
                  {sz}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`${erpCardCls} space-y-2 lg:col-span-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            Edit style
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {editorStyles.map((s) => (
              <li key={s.style_code}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    s.style_code === activeStyle
                      ? 'bg-emerald-100 font-semibold !text-[#1a1814] ring-1 ring-emerald-300/80'
                      : 'text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#f7f4ef)]'
                  }`}
                  onClick={() => {
                    setActiveStyle(s.style_code)
                    setActiveSku(null)
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
            Edit SKU
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {(editorStyles.find((s) => s.style_code === activeStyle)?.skus || []).map((sk) => (
              <li key={sk.sku}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    sk.sku === activeSku
                      ? 'bg-amber-100 font-semibold !text-[#1a1814] ring-1 ring-amber-300/80'
                      : 'text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#f7f4ef)]'
                  }`}
                  onClick={() => setActiveSku(sk.sku)}
                >
                  {sk.sku}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${erpCardCls} space-y-3 lg:col-span-1`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            {activeSku ? `${activeStyle} · ${activeSku}` : 'Select a SKU to edit'}
          </p>
          {activeSku ? (
            <>
              {activeDesignSkuId ? (
                <>
                  <p className="text-[11px] font-semibold text-[var(--color-jewelry-black,#1a1814)]">Weight ranges</p>
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
                    Save weight ROL
                  </button>
                </>
              ) : null}

              <p className="pt-2 text-[11px] font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Size / product ROL (grams)
              </p>
              <button
                type="button"
                className={erpBtnGhost}
                onClick={() =>
                  setDraftSizes((prev) => [
                    ...prev,
                    { key: `new-${Date.now()}`, product_name: '', size: '', rol_wt_g: '' },
                  ])
                }
              >
                <Plus className="size-4" />
                Add size row
              </button>
              <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b bg-[var(--color-slate-900,#faf8f4)] text-left text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-2 py-1.5">Product</th>
                      <th className="px-2 py-1.5">Size</th>
                      <th className="px-2 py-1.5">ROL WT</th>
                      <th className="px-2 py-1.5">Avail WT</th>
                      <th className="px-2 py-1.5">Need WT</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {draftSizes.map((d, i) => {
                      const live = liveSizes[i]
                      return (
                        <tr key={d.key} className="border-b border-[var(--color-slate-700,#e8e4df)]/50">
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.product_name}
                              onChange={(e) =>
                                setDraftSizes((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, product_name: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.size}
                              onChange={(e) =>
                                setDraftSizes((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, size: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="p-1">
                            <input
                              className={`${erpInputCls} !min-h-8 !py-1 text-xs`}
                              value={d.rol_wt_g}
                              onChange={(e) =>
                                setDraftSizes((prev) =>
                                  prev.map((r, j) => (j === i ? { ...r, rol_wt_g: e.target.value } : r)),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1 tabular-nums text-emerald-700">{live?.available_wt ?? '—'}</td>
                          <td className="px-2 py-1 tabular-nums text-rose-600">{live?.required_wt ?? '—'}</td>
                          <td className="p-1">
                            <button
                              type="button"
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                              onClick={() => setDraftSizes((prev) => prev.filter((_, j) => j !== i))}
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
              <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveSizeTargets()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save size ROL
              </button>
            </>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Select a SKU to edit ROL.</p>
          )}
        </div>
      </div>

      <div className={`${erpCardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">ROL report</p>
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              {report.length ? `${report.length} SKU(s) · ${summaryRequired} piece(s) required` : null}
              {report.length && sizeReport.length ? ' · ' : null}
              {sizeReport.length
                ? `${sizeReport.length} size row(s) · ${summaryRequiredWt.toFixed(1)} g required`
                : null}
              {!report.length && !sizeReport.length ? 'No ROL configured for the current filters.' : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} onClick={() => void downloadReportCsv()}>
              <Download className="size-4" />
              Download CSV
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              disabled={!report.length && !sizeReport.length}
              onClick={() => downloadReportExcel()}
            >
              <FileSpreadsheet className="size-4" />
              Download Excel
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              disabled={!report.length && !sizeReport.length}
              onClick={() => void downloadReportPdf()}
            >
              <FileText className="size-4" />
              Preview PDF
            </button>
          </div>
        </div>

        {report.map((block) => (
          <div key={block.design_sku_id} className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <p className="border-b bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {block.style_code} · {block.sku}
              <span className="ml-2 text-xs font-normal text-rose-600">Need {block.total_required} pc(s)</span>
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
                    <td className="px-3 py-2 text-[var(--color-jewelry-black,#1a1814)]">{r.label}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{r.available_qty}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{r.rol_qty}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-rose-700">{r.required_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {sizeReport.length ? (
          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <p className="border-b bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Size / product ROL
              <span className="ml-2 text-xs font-normal text-rose-600">Need {summaryRequiredWt.toFixed(1)} g</span>
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                  <th className="px-3 py-2">Style</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Product name</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Available WT</th>
                  <th className="px-3 py-2">ROL WT set</th>
                  <th className="px-3 py-2">Required WT</th>
                </tr>
              </thead>
              <tbody>
                {sizeReport.map((r, i) => (
                  <tr
                    key={`${r.style_code}-${r.sku}-${r.product_name}-${r.size}-${i}`}
                    className={`border-t border-[var(--color-slate-700,#e8e4df)]/50 ${
                      (r.required_wt || 0) > 0 ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-[var(--color-jewelry-black,#1a1814)]">{r.style_code}</td>
                    <td className="px-3 py-2 text-[var(--color-jewelry-black,#1a1814)]">{r.sku}</td>
                    <td className="px-3 py-2 text-[var(--color-jewelry-black,#1a1814)]">{r.product_name}</td>
                    <td className="px-3 py-2 text-[var(--color-jewelry-black,#1a1814)]">{r.size}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{r.available_wt}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--color-jewelry-black,#1a1814)]">{r.rol_wt_g}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-rose-700">{r.required_wt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-xs font-medium text-rose-600">{err}</p> : null}
    </div>
  )
}
