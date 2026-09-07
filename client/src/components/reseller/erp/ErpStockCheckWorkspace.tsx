'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { FileSpreadsheet, FileText, Loader2, ScanLine } from 'lucide-react'
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

export function ErpStockCheckWorkspace() {
  const [floors, setFloors] = useState<Floor[]>([])
  const [loadingFloors, setLoadingFloors] = useState(true)
  const [selectedFloorIds, setSelectedFloorIds] = useState<string[]>([])
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([])
  const [scopeAll, setScopeAll] = useState(false)
  const [scopeBarcodes, setScopeBarcodes] = useState<Map<string, ScopeBarcode>>(new Map())
  const [scopeLoaded, setScopeLoaded] = useState(false)
  const [scopeBusy, setScopeBusy] = useState(false)
  const [scanCode, setScanCode] = useState('')
  const [scans, setScans] = useState<ScanRow[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void axios
      .get<{ floors: Floor[] }>('/api/reseller/erp/floors')
      .then((r) => setFloors(r.data.floors || []))
      .catch(() => setFloors([]))
      .finally(() => setLoadingFloors(false))
  }, [])

  const toggleFloor = (id: string) => {
    setScopeAll(false)
    setSelectedFloorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleBox = (id: string) => {
    setScopeAll(false)
    setSelectedBoxIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

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
  }, [scopeAll, selectedBoxIds, selectedFloorIds])

  const pushScan = (raw: string) => {
    const barcode = raw.trim().toUpperCase()
    if (!barcode) return
    if (!scopeLoaded) {
      setMsg('Load scope first (floors/boxes).')
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

  const stats = useMemo(() => {
    const found = scans.filter((s) => s.found).length
    const missing = scans.filter((s) => !s.found).length
    const uniqueFound = new Set(scans.filter((s) => s.found).map((s) => s.barcode)).size
    const uniqueMissing = new Set(scans.filter((s) => !s.found).map((s) => s.barcode)).size
    return { found, missing, uniqueFound, uniqueMissing, total: scans.length }
  }, [scans])

  const exportCsv = () => {
    const header = ['Barcode', 'Status', 'SKU', 'Product', 'Scanned at']
    const rows = scans.map((s) => [
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
    const scannedSet = new Set(scans.map((s) => s.barcode))
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
    for (const s of scans.filter((x) => !x.found)) {
      rows.push([s.barcode, 'NOT IN SCOPE', '', '', '', ''])
    }
    downloadCsv(`stock-check-report-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows])
    setMsg('Report CSV downloaded.')
  }

  const exportPdf = () => {
    const lines = [
      'Stock checking report',
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      `Scope: ${scopeBarcodes.size} barcodes`,
      `Scans: ${stats.total} (${stats.uniqueFound} found unique, ${stats.uniqueMissing} missing unique)`,
      '',
      '--- Scanned ---',
      ...scans.map(
        (s) =>
          `${s.barcode}\t${s.found ? 'FOUND' : 'NOT IN SCOPE'}\t${s.sku || ''}\t${s.product_name || ''}`,
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url, '_blank')
    if (w) w.document.title = 'Stock check'
    setMsg('Report opened — use browser Print → Save as PDF.')
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
            Choose floor/box scope, load barcodes, then scan continuously. Found = yellow highlight; missing = red.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={scopeBusy} onClick={() => void loadScope()}>
            {scopeBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            Load scope
          </button>
          <button
            type="button"
            className={erpBtnGhost}
            disabled={!scans.length}
            onClick={() => {
              setScans([])
              setMsg('Scan list cleared.')
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
            {floors.map((f) => (
              <li key={f.id} className="rounded-lg border border-[var(--color-slate-900,#e8e4dc)] p-2">
                <label className="flex cursor-pointer items-center gap-2 font-medium text-[var(--color-jewelry-black,#1a1814)]">
                  <input
                    type="checkbox"
                    disabled={scopeAll}
                    checked={selectedFloorIds.includes(f.id)}
                    onChange={() => toggleFloor(f.id)}
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
                            onChange={() => toggleBox(b.id)}
                          />
                          Box {b.code || b.label}
                          <span className="text-[10px] opacity-60">({b.piece_count ?? 0})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
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
              Missing: {stats.uniqueMissing}
            </div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              In scope: {scopeBarcodes.size}
            </div>
            <div className="rounded-lg bg-[var(--color-slate-900,#f7f4ef)] px-2 py-1.5">
              Scans: {stats.total}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} disabled={!scans.length} onClick={exportCsv}>
              <FileSpreadsheet className="size-4" />
              Scan log CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!scopeLoaded} onClick={exportSummaryCsv}>
              <FileSpreadsheet className="size-4" />
              Full report CSV
            </button>
            <button type="button" className={erpBtnGhost} disabled={!scans.length} onClick={exportPdf}>
              <FileText className="size-4" />
              Print / PDF
            </button>
          </div>
          {msg ? <p className="mt-2 text-xs text-emerald-800">{msg}</p> : null}
        </div>
      </div>

      <div className={erpCardCls}>
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          Scan results
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
              {scans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No scans yet.
                  </td>
                </tr>
              ) : (
                scans.map((s, i) => (
                  <tr
                    key={s.id}
                    className={s.found ? 'bg-amber-100 text-amber-950' : 'bg-red-50 text-red-900'}
                  >
                    <td className="px-2 py-1.5">{scans.length - i}</td>
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
    </div>
  )
}
