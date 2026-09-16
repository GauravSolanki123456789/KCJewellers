'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Merge,
  Pencil,
  Save,
  ScanLine,
  Trash2,
} from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import {
  buildReportData,
  buildFloorSummary,
  previewStockCheckPdf,
} from '@/lib/erp-stock-check-pdf'
import {
  loadArchive,
  loadDrafts,
  loadWorkspacePersist,
  mergeScopeMaps,
  saveArchive,
  saveDrafts,
  saveWorkspacePersist,
  scopeFromArray,
  scopeToArray,
  uniqueScans,
  type StockCheckArchive,
  type StockCheckDraft,
  type StockCheckScanRow,
  type StockCheckScopeBarcode,
} from '@/lib/erp-stock-check-storage'

type FloorBox = {
  id: string
  code: string
  label?: string | null
  piece_count?: number
}

type Floor = {
  id: string
  name: string
  code: string
  piece_count?: number
  boxes: FloorBox[]
}

function downloadCsv(filename: string, rows: string[][]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`
  const body = rows.map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function buildStats(scopeBarcodes: Map<string, StockCheckScopeBarcode>, scans: StockCheckScanRow[]) {
  const uniq = uniqueScans(scans)
  const scannedSet = new Set(uniq.map((s) => s.barcode))
  const uniqueFound = uniq.filter((s) => s.found).length
  const missingBarcodes: string[] = []
  for (const code of scopeBarcodes.keys()) {
    if (!scannedSet.has(code)) missingBarcodes.push(code)
  }
  return {
    uniqueFound,
    uniqueMissingScope: missingBarcodes.length,
    notInScope: uniq.filter((s) => !s.found).length,
    missingBarcodes,
  }
}

export function ErpStockCheckWorkspace() {
  const [floors, setFloors] = useState<Floor[]>([])
  const [loadingFloors, setLoadingFloors] = useState(true)
  const [selectedFloorIds, setSelectedFloorIds] = useState<string[]>([])
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([])
  const [scopeAll, setScopeAll] = useState(false)
  const [scopeBarcodes, setScopeBarcodes] = useState<Map<string, StockCheckScopeBarcode>>(new Map())
  const [scopeLoaded, setScopeLoaded] = useState(false)
  const [scopeBusy, setScopeBusy] = useState(false)
  const [scopeLabel, setScopeLabel] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scans, setScans] = useState<StockCheckScanRow[]>([])
  const [drafts, setDrafts] = useState<StockCheckDraft[]>([])
  const [archive, setArchive] = useState<StockCheckArchive[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    setDrafts(loadDrafts())
    setArchive(loadArchive())
    const saved = loadWorkspacePersist()
    if (saved) {
      setSelectedFloorIds(saved.selectedFloorIds || [])
      setSelectedBoxIds(saved.selectedBoxIds || [])
      setScopeAll(saved.scopeAll || false)
      setScopeBarcodes(scopeFromArray(saved.scopeBarcodes || []))
      setScopeLoaded(saved.scopeLoaded || false)
      setScopeLabel(saved.scopeLabel || '')
      setScans(saved.scans || [])
    }
    hydratedRef.current = true
    void axios
      .get<{ floors: Floor[] }>('/api/reseller/erp/floors')
      .then((r) => setFloors(r.data.floors || []))
      .catch(() => setFloors([]))
      .finally(() => setLoadingFloors(false))
  }, [])

  useEffect(() => {
    if (!hydratedRef.current) return
    saveWorkspacePersist({
      selectedFloorIds,
      selectedBoxIds,
      scopeAll,
      scopeBarcodes: scopeToArray(scopeBarcodes),
      scopeLoaded,
      scopeLabel,
      scans,
    })
  }, [selectedFloorIds, selectedBoxIds, scopeAll, scopeBarcodes, scopeLoaded, scopeLabel, scans])

  const toggleFloor = (floor: Floor, checked: boolean) => {
    setScopeAll(false)
    const boxIds = (floor.boxes || []).map((b) => b.id)
    setSelectedFloorIds((prev) =>
      checked ? [...new Set([...prev, floor.id])] : prev.filter((x) => x !== floor.id),
    )
    setSelectedBoxIds((prev) => {
      if (checked) return [...new Set([...prev, ...boxIds])]
      return prev.filter((id) => !boxIds.includes(id))
    })
  }

  const toggleBox = (floor: Floor, boxId: string, checked: boolean) => {
    setScopeAll(false)
    setSelectedBoxIds((prev) => {
      const next = checked ? [...new Set([...prev, boxId])] : prev.filter((x) => x !== boxId)
      if (checked) {
        setSelectedFloorIds((fprev) => [...new Set([...fprev, floor.id])])
      } else {
        const stillHasBox = (floor.boxes || []).some((b) => b.id !== boxId && next.includes(b.id))
        if (!stillHasBox) {
          setSelectedFloorIds((fprev) => fprev.filter((x) => x !== floor.id))
        }
      }
      return next
    })
  }

  const buildScopeLabel = useCallback(() => {
    if (scopeAll) return 'Entire stock'
    const parts: string[] = []
    for (const f of floors) {
      if (selectedFloorIds.includes(f.id)) {
        const boxes = (f.boxes || []).filter((b) => selectedBoxIds.includes(b.id))
        if (boxes.length && boxes.length < (f.boxes?.length || 0)) {
          parts.push(`${f.name || f.code}: ${boxes.map((b) => b.code || b.label).join(', ')}`)
        } else {
          parts.push(f.name || f.code)
        }
      }
    }
    return parts.join(' · ') || 'Custom scope'
  }, [scopeAll, floors, selectedFloorIds, selectedBoxIds])

  const loadScope = useCallback(async () => {
    setScopeBusy(true)
    setMsg(null)
    try {
      const params: Record<string, string> = {}
      if (scopeAll) params.all = '1'
      else if (selectedBoxIds.length) params.box_ids = selectedBoxIds.join(',')
      else if (selectedFloorIds.length) params.floor_ids = selectedFloorIds.join(',')
      else {
        setMsg('Select floor(s), box(es), or entire stock.')
        return
      }
      const res = await axios.get<{ barcodes: StockCheckScopeBarcode[]; count: number }>(
        '/api/reseller/erp/stock-check/barcodes',
        { params },
      )
      const incoming = res.data.barcodes || []
      const merged = mergeScopeMaps(scopeBarcodes, incoming)
      const label = buildScopeLabel()
      setScopeBarcodes(merged)
      setScopeLoaded(true)
      setScopeLabel((prev) => {
        if (!prev || !scopeLoaded) return label
        return `${prev} + ${label}`
      })
      setMsg(`Added ${incoming.length} barcode(s). Total in scope: ${merged.size}. Scans kept.`)
      scanRef.current?.focus()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setScopeBusy(false)
    }
  }, [scopeAll, selectedBoxIds, selectedFloorIds, buildScopeLabel, scopeBarcodes, scopeLoaded])

  const uniqueScanRows = useMemo(() => uniqueScans(scans), [scans])
  const scannedBarcodeSet = useMemo(() => new Set(uniqueScanRows.map((s) => s.barcode)), [uniqueScanRows])
  const stats = useMemo(
    () => buildStats(scopeBarcodes, scans),
    [scopeBarcodes, scans],
  )

  const pushScan = (raw: string) => {
    const barcode = raw.trim().toUpperCase()
    if (!barcode) return
    if (!scopeLoaded) {
      setMsg('Load scope first (floors/boxes).')
      return
    }
    if (scannedBarcodeSet.has(barcode)) {
      setMsg(`Already scanned: ${barcode}`)
      setScanCode('')
      scanRef.current?.focus()
      return
    }
    const hit = scopeBarcodes.get(barcode)
    const row: StockCheckScanRow = {
      id: `${barcode}-${Date.now()}`,
      barcode,
      found: !!hit,
      sku: hit?.sku ?? null,
      product_name: hit?.product_name ?? null,
      scannedAt: Date.now(),
    }
    setScans((prev) => [row, ...prev])
    setScanCode('')
    setMsg(hit ? `Found: ${barcode}` : `Not in scope: ${barcode}`)
    scanRef.current?.focus()
  }

  const makeReport = useCallback(
    (opts: {
      label: string
      scopeRows: StockCheckScopeBarcode[]
      scanRows: StockCheckScanRow[]
      title?: string
    }) =>
      buildReportData({
        title: opts.title,
        scopeLabel: opts.label,
        scopeBarcodes: opts.scopeRows,
        scans: uniqueScans(opts.scanRows),
      }),
    [],
  )

  const previewReport = async (report: ReturnType<typeof buildReportData>) => {
    setPdfBusy(true)
    try {
      await previewStockCheckPdf(report)
      setMsg('PDF preview opened in this tab.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setPdfBusy(false)
    }
  }

  const previewCurrent = () => {
    void previewReport(
      makeReport({
        label: scopeLabel || buildScopeLabel(),
        scopeRows: scopeToArray(scopeBarcodes),
        scanRows: scans,
      }),
    )
  }

  const saveDraft = () => {
    if (!scans.length) {
      setMsg('Scan at least one barcode before saving draft.')
      return
    }
    const name = draftName.trim() || `Draft ${new Date().toLocaleString('en-IN')}`
    const draft: StockCheckDraft = {
      id: `draft-${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      scopeLabel: scopeLabel || buildScopeLabel(),
      scopeBarcodes: scopeToArray(scopeBarcodes),
      scans: uniqueScanRows,
    }
    const next = [draft, ...loadDrafts()]
    saveDrafts(next)
    setDrafts(next)
    setDraftName('')
    setMsg(`Draft saved: ${name}`)
  }

  const continueDraft = (draft: StockCheckDraft) => {
    setScopeBarcodes(scopeFromArray(draft.scopeBarcodes))
    setScopeLoaded(true)
    setScopeLabel(draft.scopeLabel)
    setScans(draft.scans)
    setMsg(`Loaded draft "${draft.name}". Continue scanning.`)
    scanRef.current?.focus()
  }

  const mergeDraft = (draft: StockCheckDraft) => {
    setScopeBarcodes((prev) => mergeScopeMaps(prev, draft.scopeBarcodes))
    setScopeLoaded(true)
    setScopeLabel((prev) => (prev ? `${prev} + ${draft.scopeLabel}` : draft.scopeLabel))
    const mergedScans = uniqueScans([...draft.scans, ...scans])
    setScans(mergedScans)
    setMsg(`Merged draft "${draft.name}" into current session.`)
    scanRef.current?.focus()
  }

  const deleteDraft = (id: string) => {
    const next = loadDrafts().filter((d) => d.id !== id)
    saveDrafts(next)
    setDrafts(next)
    setMsg('Draft deleted.')
  }

  const finishScan = () => {
    if (!scans.length) {
      setMsg('Scan at least one barcode before finishing.')
      return
    }
    const session: StockCheckArchive = {
      id: `scan-${Date.now()}`,
      label: scopeLabel || buildScopeLabel(),
      finishedAt: new Date().toISOString(),
      scopeCount: scopeBarcodes.size,
      scopeBarcodes: scopeToArray(scopeBarcodes),
      scans: uniqueScanRows,
      stats: {
        uniqueFound: stats.uniqueFound,
        uniqueMissing: stats.uniqueMissingScope,
        notInScope: stats.notInScope,
      },
    }
    const next = [session, ...loadArchive()]
    saveArchive(next)
    setArchive(next)
    setScans([])
    setScopeBarcodes(new Map())
    setScopeLoaded(false)
    setScopeLabel('')
    setMsg(`Scan finished (${session.stats.uniqueFound} found, ${session.stats.uniqueMissing} missing).`)
    scanRef.current?.focus()
  }

  const exportCsv = () => {
    const header = ['Barcode', 'Status', 'SKU', 'Product', 'Scanned at']
    const rows = uniqueScanRows.map((s) => [
      s.barcode,
      s.found ? 'FOUND' : 'NOT IN SCOPE',
      s.sku || '',
      s.product_name || '',
      new Date(s.scannedAt).toLocaleString('en-IN'),
    ])
    downloadCsv(`stock-check-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('Scan log CSV downloaded.')
  }

  const exportSummaryCsv = () => {
    const header = ['Barcode', 'In scope', 'SKU', 'Product', 'Floor', 'Box']
    const scannedSet = new Set(uniqueScanRows.map((s) => s.barcode))
    const rows: string[][] = []
    for (const [code, meta] of scopeBarcodes) {
      rows.push([
        code,
        scannedSet.has(code) ? 'SCANNED' : 'NOT SCANNED',
        meta.sku || '',
        meta.product_name || '',
        meta.floor_name || '',
        meta.box_code || '',
      ])
    }
    for (const s of uniqueScanRows.filter((x) => !x.found)) {
      rows.push([s.barcode, 'NOT IN SCOPE', s.sku || '', s.product_name || '', '', ''])
    }
    downloadCsv(`stock-check-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('Full report CSV downloaded.')
  }

  const exportFloorCsv = () => {
    const summary = buildFloorSummary(scopeToArray(scopeBarcodes), uniqueScanRows)
    const header = ['Floor', 'Box', 'In scope', 'Found', 'Missing']
    const rows = summary.map((f) => [f.floor, f.box, String(f.inScope), String(f.found), String(f.missing)])
    downloadCsv(`stock-check-floors-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('Floor / box summary CSV downloaded.')
  }

  const deleteArchive = (id: string) => {
    const next = loadArchive().filter((s) => s.id !== id)
    saveArchive(next)
    setArchive(next)
    setSelectedArchiveIds((prev) => prev.filter((x) => x !== id))
    setMsg('Past scan deleted.')
  }

  const renameArchive = (id: string) => {
    const current = loadArchive().find((s) => s.id === id)
    if (!current) return
    const nextName = window.prompt('Rename scan', current.label)
    if (!nextName?.trim()) return
    const next = loadArchive().map((s) => (s.id === id ? { ...s, label: nextName.trim() } : s))
    saveArchive(next)
    setArchive(next)
    setMsg('Scan renamed.')
  }

  const previewArchive = (session: StockCheckArchive) => {
    void previewReport(
      makeReport({
        label: session.label,
        scopeRows: session.scopeBarcodes,
        scanRows: session.scans,
      }),
    )
  }

  const mergeSelectedArchive = () => {
    const picked = loadArchive().filter((s) => selectedArchiveIds.includes(s.id))
    if (picked.length < 2) {
      setMsg('Select at least 2 past scans to merge.')
      return
    }
    const scopeMap = new Map<string, StockCheckScopeBarcode>()
    let allScans: StockCheckScanRow[] = []
    for (const s of picked) {
      for (const row of s.scopeBarcodes) {
        const code = String(row.barcode || '').trim().toUpperCase()
        if (code) scopeMap.set(code, row)
      }
      allScans = uniqueScans([...allScans, ...s.scans])
    }
    const label = picked.map((s) => s.label).join(' + ')
    void previewReport(
      makeReport({
        title: 'Merged stock checking report',
        label,
        scopeRows: [...scopeMap.values()],
        scanRows: allScans,
      }),
    )
    setMsg(`Merged preview for ${picked.length} scans.`)
  }

  const loadMergedIntoWorkspace = () => {
    const picked = loadArchive().filter((s) => selectedArchiveIds.includes(s.id))
    if (!picked.length) {
      setMsg('Select past scan(s) to load.')
      return
    }
    const scopeMap = new Map<string, StockCheckScopeBarcode>()
    let allScans: StockCheckScanRow[] = []
    for (const s of picked) {
      for (const row of s.scopeBarcodes) {
        const code = String(row.barcode || '').trim().toUpperCase()
        if (code) scopeMap.set(code, row)
      }
      allScans = uniqueScans([...allScans, ...s.scans])
    }
    setScopeBarcodes(scopeMap)
    setScopeLoaded(true)
    setScopeLabel(picked.map((s) => s.label).join(' + '))
    setScans(allScans)
    setMsg(`Loaded ${picked.length} scan(s) into workspace.`)
    scanRef.current?.focus()
  }

  if (loadingFloors) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-4 animate-spin" />
        Loading floors…
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <ScanLine className="size-4 text-emerald-700" />
            Stock checking
          </p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Select scope, load barcodes, scan once per item. Your progress is saved when you switch tabs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={scopeBusy} onClick={() => void loadScope()}>
            {scopeBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Load scope
          </button>
          <button type="button" className={erpBtnPrimary} disabled={!scans.length} onClick={finishScan}>
            <CheckCircle2 className="size-4" />
            Finish scan
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            disabled={!scans.length}
            onClick={() => {
              setScans([])
              setMsg('Current scan list cleared.')
            }}
          >
            Clear scans
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={erpCardCls}>
          <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Scope — floors & boxes
          </p>
          <label className="mb-3 flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]">
            <input
              type="checkbox"
              checked={scopeAll}
              onChange={(e) => {
                setScopeAll(e.target.checked)
                if (e.target.checked) {
                  setSelectedFloorIds([])
                  setSelectedBoxIds([])
                }
              }}
            />
            Entire in-stock inventory
          </label>
          <ul className="max-h-[320px] space-y-2 overflow-y-auto text-sm">
            {floors.map((f) => {
              const boxIds = (f.boxes || []).map((b) => b.id)
              const floorChecked =
                selectedFloorIds.includes(f.id) &&
                (boxIds.length === 0 || boxIds.every((id) => selectedBoxIds.includes(id)))
              return (
                <li key={f.id} className="rounded-lg border border-[var(--color-slate-900,#e8e4dc)] p-2">
                  <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">
                    <input
                      type="checkbox"
                      disabled={scopeAll}
                      checked={floorChecked}
                      onChange={(e) => toggleFloor(f, e.target.checked)}
                    />
                    {f.name || f.code}
                    <span className="text-[10px] opacity-60">({f.piece_count ?? 0} pcs)</span>
                  </label>
                  {f.boxes?.length ? (
                    <ul className="mt-2 ml-5 space-y-1 border-l border-[var(--color-slate-900,#e8e4dc)] pl-3">
                      {f.boxes.map((b) => (
                        <li key={b.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/80">
                            <input
                              type="checkbox"
                              disabled={scopeAll}
                              checked={selectedBoxIds.includes(b.id)}
                              onChange={(e) => toggleBox(f, b.id, e.target.checked)}
                            />
                            Box {b.code || b.label}
                            <span className="text-[10px] opacity-60">({b.piece_count ?? 0})</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>

        <div className={erpCardCls}>
          <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Scanner
          </p>
          <input
            ref={scanRef}
            className={`${erpInputCls} mb-3 w-full text-sm`}
            placeholder={scopeLoaded ? 'Scan barcode…' : 'Load scope first'}
            value={scanCode}
            disabled={!scopeLoaded}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                pushScan(scanCode)
              }
            }}
          />
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-amber-100 px-2 py-1.5 text-amber-950">Found: {stats.uniqueFound}</div>
            <div className="rounded-lg bg-red-100 px-2 py-1.5 text-red-950">Missing: {stats.uniqueMissingScope}</div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              In scope: {scopeBarcodes.size}
            </div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              Unique scans: {uniqueScanRows.length}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} disabled={!uniqueScanRows.length} onClick={exportCsv}>
              <FileSpreadsheet className="size-4" />
              Scan log CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!scopeLoaded} onClick={exportSummaryCsv}>
              <FileSpreadsheet className="size-4" />
              Full report CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!scopeLoaded} onClick={exportFloorCsv}>
              <FileSpreadsheet className="size-4" />
              Floor / box CSV
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              disabled={!uniqueScanRows.length || pdfBusy}
              onClick={previewCurrent}
            >
              {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              Preview PDF
            </button>
          </div>
          {scopeLabel ? (
            <p className="mt-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">Scope: {scopeLabel}</p>
          ) : null}
          {msg ? <p className="mt-2 text-xs text-emerald-800">{msg}</p> : null}
        </div>
      </div>

      <div className={`${erpCardCls} grid gap-3 sm:grid-cols-[1fr_auto_auto]`}>
        <input
          className={`${erpInputCls} text-sm`}
          placeholder="Draft name (optional)"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        <button type="button" className={erpBtnPrimary} disabled={!scans.length} onClick={saveDraft}>
          <Save className="size-4" />
          Save scan
        </button>
      </div>

      {drafts.length > 0 ? (
        <details className={erpCardCls} open={drafts.length <= 4}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/55 marker:content-none">
            <Save className="size-4" />
            Saved drafts ({drafts.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{d.name}</p>
                  <p className="text-[var(--color-jewelry-black,#1a1814)]/55">
                    {new Date(d.savedAt).toLocaleString('en-IN')} · {d.scans.length} scans · scope{' '}
                    {d.scopeBarcodes.length}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={erpBtnGhost} onClick={() => continueDraft(d)}>
                    Continue
                  </button>
                  <button type="button" className={erpBtnGhost} onClick={() => mergeDraft(d)}>
                    <Merge className="size-3.5" />
                    Merge
                  </button>
                  <button type="button" className={erpBtnGhost} onClick={() => deleteDraft(d.id)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {stats.missingBarcodes.length > 0 && scopeLoaded ? (
        <div className={`${erpCardCls} border-red-100 bg-red-50/40`}>
          <p className="mb-2 text-xs font-semibold uppercase text-red-900">
            Missing in scope ({stats.missingBarcodes.length})
          </p>
          <p className="mb-2 text-[11px] text-red-900/70">These barcodes are in scope but not scanned yet.</p>
          <div className="max-h-40 overflow-auto rounded-lg border border-red-200 bg-white p-2 font-mono text-[11px] text-red-950">
            {stats.missingBarcodes.slice(0, 120).join(', ')}
            {stats.missingBarcodes.length > 120 ? '…' : ''}
          </div>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          Scan results (unique)
        </p>
        <div className="max-h-[min(480px,calc(100vh-14rem))] overflow-auto rounded-lg border border-[var(--color-slate-900,#e8e4dc)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--color-slate-900,#f7f4ef)] text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Barcode</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {uniqueScanRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                uniqueScanRows.map((s, i) => (
                  <tr
                    key={s.id}
                    className={s.found ? 'bg-amber-100 text-amber-950' : 'bg-red-50 text-red-900'}
                  >
                    <td className="px-2 py-1.5">{uniqueScanRows.length - i}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{s.barcode}</td>
                    <td className="px-2 py-1.5">{s.found ? 'In scope' : 'Not present'}</td>
                    <td className="px-2 py-1.5">{s.sku || '—'}</td>
                    <td className="px-2 py-1.5">{s.product_name || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(s.scannedAt).toLocaleTimeString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {archive.length > 0 ? (
        <details className={erpCardCls} open={archive.length <= 3}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/55 marker:content-none">
            <History className="size-4" />
            Past scans ({archive.length})
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={erpBtnGhost}
              disabled={selectedArchiveIds.length < 2}
              onClick={mergeSelectedArchive}
            >
              <Merge className="size-4" />
              Merge & preview
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              disabled={!selectedArchiveIds.length}
              onClick={loadMergedIntoWorkspace}
            >
              Load selected
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {archive.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selectedArchiveIds.includes(s.id)}
                    onChange={(e) => {
                      setSelectedArchiveIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                      )
                    }}
                  />
                  <span>
                    <span className="block font-semibold text-[var(--color-jewelry-black,#1a1814)]">{s.label}</span>
                    <span className="text-[var(--color-jewelry-black,#1a1814)]/55">
                      {new Date(s.finishedAt).toLocaleString('en-IN')} · scope {s.scopeCount} · found{' '}
                      {s.stats.uniqueFound} · missing {s.stats.uniqueMissing}
                    </span>
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={erpBtnGhost} disabled={pdfBusy} onClick={() => previewArchive(s)}>
                    <FileText className="size-3.5" />
                    Preview
                  </button>
                  <button type="button" className={erpBtnGhost} onClick={() => renameArchive(s.id)}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" className={erpBtnGhost} onClick={() => deleteArchive(s.id)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
