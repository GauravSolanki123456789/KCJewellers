'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { CheckCircle2, FileSpreadsheet, FileText, History, Loader2, ScanLine } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'

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

type ScopeBarcode = {
  barcode: string
  sku?: string | null
  style_code?: string | null
  product_name?: string | null
  size?: string | null
  floor_name?: string | null
  box_code?: string | null
}

type ScanRow = {
  id: string
  barcode: string
  found: boolean
  sku?: string | null
  product_name?: string | null
  scannedAt: number
}

type ScanSession = {
  id: string
  label: string
  finishedAt: string
  scopeCount: number
  scans: ScanRow[]
  stats: {
    uniqueFound: number
    uniqueMissing: number
    notInScope: number
    missingBarcodes: string[]
  }
}

const SESSIONS_KEY = 'kc-stock-check-sessions-v1'

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

function loadSessions(): ScanSession[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? (JSON.parse(raw) as ScanSession[]) : []
  } catch {
    return []
  }
}

function saveSessions(list: ScanSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(list.slice(0, 50)))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function ErpStockCheckWorkspace() {
  const [floors, setFloors] = useState<Floor[]>([])
  const [loadingFloors, setLoadingFloors] = useState(true)
  const [selectedFloorIds, setSelectedFloorIds] = useState<string[]>([])
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([])
  const [scopeAll, setScopeAll] = useState(false)
  const [scopeBarcodes, setScopeBarcodes] = useState<Map<string, ScopeBarcode>>(new Map())
  const [scopeLoaded, setScopeLoaded] = useState(false)
  const [scopeBusy, setScopeBusy] = useState(false)
  const [scopeLabel, setScopeLabel] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scans, setScans] = useState<ScanRow[]>([])
  const [sessions, setSessions] = useState<ScanSession[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSessions(loadSessions())
    void axios
      .get<{ floors: Floor[] }>('/api/reseller/erp/floors')
      .then((r) => setFloors(r.data.floors || []))
      .catch(() => setFloors([]))
      .finally(() => setLoadingFloors(false))
  }, [])

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
      const res = await axios.get<{ barcodes: ScopeBarcode[]; count: number }>(
        '/api/reseller/erp/stock-check/barcodes',
        { params },
      )
      const map = new Map<string, ScopeBarcode>()
      for (const row of res.data.barcodes || []) {
        const code = String(row.barcode || '').trim().toUpperCase()
        if (code) map.set(code, row)
      }
      setScopeBarcodes(map)
      setScopeLoaded(true)
      setScopeLabel(buildScopeLabel())
      setScans([])
      setMsg(`Loaded ${map.size} barcode(s) in scope. Start scanning.`)
      scanRef.current?.focus()
    } catch (e) {
      setMsg(erpErr(e))
      setScopeBarcodes(new Map())
      setScopeLoaded(false)
    } finally {
      setScopeBusy(false)
    }
  }, [scopeAll, selectedBoxIds, selectedFloorIds, buildScopeLabel])

  const scannedBarcodeSet = useMemo(() => new Set(scans.map((s) => s.barcode)), [scans])

  const uniqueScans = useMemo(() => {
    const seen = new Set<string>()
    const out: ScanRow[] = []
    for (const s of scans) {
      if (seen.has(s.barcode)) continue
      seen.add(s.barcode)
      out.push(s)
    }
    return out
  }, [scans])

  const stats = useMemo(() => {
    const uniqueFound = uniqueScans.filter((s) => s.found).length
    const uniqueMissingScope = Math.max(0, scopeBarcodes.size - uniqueFound)
    const notInScope = uniqueScans.filter((s) => !s.found).length
    const missingBarcodes: string[] = []
    for (const code of scopeBarcodes.keys()) {
      if (!scannedBarcodeSet.has(code)) missingBarcodes.push(code)
    }
    return { uniqueFound, uniqueMissingScope, notInScope, missingBarcodes }
  }, [uniqueScans, scopeBarcodes, scannedBarcodeSet])

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
    const row: ScanRow = {
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

  const finishScan = () => {
    if (!scans.length) {
      setMsg('Scan at least one barcode before finishing.')
      return
    }
    const session: ScanSession = {
      id: `scan-${Date.now()}`,
      label: scopeLabel || buildScopeLabel(),
      finishedAt: new Date().toISOString(),
      scopeCount: scopeBarcodes.size,
      scans: uniqueScans,
      stats: {
        uniqueFound: stats.uniqueFound,
        uniqueMissing: stats.uniqueMissingScope,
        notInScope: stats.notInScope,
        missingBarcodes: stats.missingBarcodes.slice(0, 500),
      },
    }
    const next = [session, ...loadSessions()]
    saveSessions(next)
    setSessions(next)
    setScans([])
    setMsg(`Scan saved (${session.stats.uniqueFound} found, ${session.stats.uniqueMissing} missing). Start a new scan when ready.`)
    scanRef.current?.focus()
  }

  const exportCsv = () => {
    const header = ['Barcode', 'Status', 'SKU', 'Product', 'Scanned at']
    const rows = uniqueScans.map((s) => [
      s.barcode,
      s.found ? 'FOUND' : 'NOT IN SCOPE',
      s.sku || '',
      s.product_name || '',
      new Date(s.scannedAt).toLocaleString('en-IN'),
    ])
    downloadCsv(`stock-check-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('CSV downloaded.')
  }

  const exportSummaryCsv = () => {
    const header = ['Barcode', 'In scope', 'SKU', 'Product', 'Floor', 'Box']
    const scannedSet = new Set(uniqueScans.map((s) => s.barcode))
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
    for (const s of uniqueScans.filter((x) => !x.found)) {
      rows.push([s.barcode, 'NOT IN SCOPE', s.sku || '', s.product_name || '', '', ''])
    }
    downloadCsv(`stock-check-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('Report CSV downloaded.')
  }

  const exportPdf = () => {
    const scannedSet = new Set(uniqueScans.map((s) => s.barcode))
    const missingRows = [...scopeBarcodes.entries()]
      .filter(([code]) => !scannedSet.has(code))
      .map(([code, meta]) => ({ code, meta }))
    const scanRows = uniqueScans.map((s) => {
      const meta = scopeBarcodes.get(s.barcode)
      return {
        ...s,
        floor: meta?.floor_name || '',
        box: meta?.box_code || '',
      }
    })
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Stock check report</title>
<style>
  body { font-family: system-ui, sans-serif; color: #1a1814; padding: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #6b6560; margin-bottom: 16px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .stat { padding: 8px 12px; border-radius: 8px; background: #f7f4ef; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #e8e4df; padding: 6px 8px; text-align: left; }
  th { background: #faf8f4; font-size: 10px; text-transform: uppercase; }
  .missing { background: #fff1f2; }
  .found { background: #fffbeb; }
  @media print { body { padding: 12px; } }
</style></head><body>
  <h1>Stock checking report</h1>
  <p class="sub">${escapeHtml(scopeLabel || 'Stock scan')} · ${escapeHtml(new Date().toLocaleString('en-IN'))}</p>
  <div class="stats">
    <div class="stat"><strong>In scope:</strong> ${scopeBarcodes.size}</div>
    <div class="stat"><strong>Found:</strong> ${stats.uniqueFound}</div>
    <div class="stat"><strong>Missing:</strong> ${stats.uniqueMissingScope}</div>
    <div class="stat"><strong>Not in scope scans:</strong> ${stats.notInScope}</div>
  </div>
  <h2>Scanned (${scanRows.length})</h2>
  <table><thead><tr><th>Barcode</th><th>Status</th><th>SKU</th><th>Product</th><th>Floor</th><th>Box</th></tr></thead><tbody>
  ${scanRows
    .map(
      (s) =>
        `<tr class="${s.found ? 'found' : 'missing'}"><td>${escapeHtml(s.barcode)}</td><td>${s.found ? 'FOUND' : 'NOT IN SCOPE'}</td><td>${escapeHtml(s.sku || '')}</td><td>${escapeHtml(s.product_name || '')}</td><td>${escapeHtml(s.floor || '')}</td><td>${escapeHtml(s.box || '')}</td></tr>`,
    )
    .join('')}
  </tbody></table>
  <h2>Missing from scope (${missingRows.length})</h2>
  <table><thead><tr><th>Barcode</th><th>SKU</th><th>Product</th><th>Floor</th><th>Box</th></tr></thead><tbody>
  ${missingRows
    .map(
      ({ code, meta }) =>
        `<tr class="missing"><td>${escapeHtml(code)}</td><td>${escapeHtml(meta.sku || '')}</td><td>${escapeHtml(meta.product_name || '')}</td><td>${escapeHtml(meta.floor_name || '')}</td><td>${escapeHtml(meta.box_code || '')}</td></tr>`,
    )
    .join('')}
  </tbody></table>
  <script>window.onload = function(){ window.print(); };</script>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      setMsg('Allow pop-ups to open the print preview.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    setMsg('Print preview opened — use Save as PDF.')
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
            Select scope, load barcodes, scan once per item. Finish scan to save a session for later review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={scopeBusy} onClick={() => void loadScope()}>
            {scopeBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Load scope
          </button>
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={!scans.length}
            onClick={finishScan}
          >
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
            <div className="rounded-lg bg-amber-100 px-2 py-1.5 text-amber-950">
              Found: {stats.uniqueFound}
            </div>
            <div className="rounded-lg bg-red-100 px-2 py-1.5 text-red-950">
              Missing: {stats.uniqueMissingScope}
            </div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              In scope: {scopeBarcodes.size}
            </div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              Unique scans: {uniqueScans.length}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} disabled={!uniqueScans.length} onClick={exportCsv}>
              <FileSpreadsheet className="size-4" />
              Scan log CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!scopeLoaded} onClick={exportSummaryCsv}>
              <FileSpreadsheet className="size-4" />
              Full report CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!uniqueScans.length} onClick={exportPdf}>
              <FileText className="size-4" />
              Print / PDF
            </button>
          </div>
          {msg ? <p className="mt-2 text-xs text-emerald-800">{msg}</p> : null}
        </div>
      </div>

      {stats.missingBarcodes.length > 0 && scopeLoaded ? (
        <div className={`${erpCardCls} border-red-100 bg-red-50/40`}>
          <p className="mb-2 text-xs font-semibold uppercase text-red-900">
            Missing in scope ({stats.missingBarcodes.length})
          </p>
          <p className="mb-2 text-[11px] text-red-900/70">
            These barcodes are in scope but not scanned yet.
          </p>
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
              {uniqueScans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                uniqueScans.map((s, i) => (
                  <tr
                    key={s.id}
                    className={s.found ? 'bg-amber-100 text-amber-950' : 'bg-red-50 text-red-900'}
                  >
                    <td className="px-2 py-1.5">{uniqueScans.length - i}</td>
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

      {sessions.length > 0 ? (
        <details className={erpCardCls} open={sessions.length <= 3}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/55 marker:content-none">
            <History className="size-4" />
            Past scans ({sessions.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs"
              >
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{s.label}</p>
                <p className="text-[var(--color-jewelry-black,#1a1814)]/55">
                  {new Date(s.finishedAt).toLocaleString('en-IN')} · scope {s.scopeCount} · found{' '}
                  {s.stats.uniqueFound} · missing {s.stats.uniqueMissing}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
