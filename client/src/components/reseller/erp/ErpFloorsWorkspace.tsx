'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { downloadLocationQrImages, type LocationLabelRow } from '@/lib/erp-location-label-print'
import { Building2, Download, Loader2, MapPin, Package, Pencil, Plus, Search, Shuffle } from 'lucide-react'

type FloorBox = {
  id: string
  code: string
  label?: string | null
  qr_payload?: string
  piece_count?: number
  net_weight_gm?: number
  gross_weight_gm?: number
}

type Floor = {
  id: string
  name: string
  code: string
  qr_payload?: string
  piece_count?: number
  net_weight_gm?: number
  gross_weight_gm?: number
  boxes: FloorBox[]
}

type LookupResult = {
  found: boolean
  kind?: 'floor' | 'box' | 'piece'
  floor?: Floor
  box?: FloorBox & { floor_name?: string; floor_code?: string }
  piece?: {
    barcode: string
    product_name?: string
    avg_weight?: number
    gross_weight?: number
    floor_name?: string
    floor_code?: string
    box_code?: string
    status?: string
  }
  stats?: { piece_count: number; net_weight_gm: number; gross_weight_gm: number }
  pieces?: { barcode: string; product_name?: string; avg_weight?: number }[]
  query?: string
}

type Tab = 'manage' | 'find' | 'transfer'

export function ErpFloorsWorkspace() {
  const [tab, setTab] = useState<Tab>('manage')
  const [floors, setFloors] = useState<Floor[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [newFloorName, setNewFloorName] = useState('')
  const [newFloorCode, setNewFloorCode] = useState('')
  const [expandedFloor, setExpandedFloor] = useState<string | null>(null)
  const [newBoxCode, setNewBoxCode] = useState<Record<string, string>>({})

  const [lookupQ, setLookupQ] = useState('')
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)

  const [transferScans, setTransferScans] = useState<string[]>([])
  const [transferScanInput, setTransferScanInput] = useState('')
  const [transferFloorId, setTransferFloorId] = useState('')
  const [transferBoxId, setTransferBoxId] = useState('')

  const loadFloors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ floors: Floor[] }>('/api/reseller/erp/floors')
      setFloors(res.data.floors || [])
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFloors()
  }, [loadFloors])

  const transferBoxes = useMemo(() => {
    const f = floors.find((x) => x.id === transferFloorId)
    return f?.boxes || []
  }, [floors, transferFloorId])

  const createFloor = async () => {
    if (!newFloorName.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await axios.post('/api/reseller/erp/floors', {
        name: newFloorName.trim(),
        code: newFloorCode.trim() || undefined,
      })
      setNewFloorName('')
      setNewFloorCode('')
      setMsg('Floor created')
      await loadFloors()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const createBox = async (floorId: string) => {
    setBusy(true)
    setErr(null)
    try {
      await axios.post(`/api/reseller/erp/floors/${floorId}/boxes`, {
        code: newBoxCode[floorId]?.trim() || undefined,
      })
      setNewBoxCode((prev) => ({ ...prev, [floorId]: '' }))
      setMsg('Box created')
      await loadFloors()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const renameFloor = async (floor: Floor) => {
    const name = window.prompt('Floor name', floor.name)?.trim()
    if (!name) return
    setBusy(true)
    setErr(null)
    try {
      await axios.put(`/api/reseller/erp/floors/${floor.id}`, { name })
      setMsg('Floor renamed')
      await loadFloors()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const renameBox = async (floorId: string, box: FloorBox) => {
    const label = window.prompt('Box name (shown on labels & RFID)', box.label || box.code)?.trim()
    if (!label) return
    setBusy(true)
    setErr(null)
    try {
      await axios.put(`/api/reseller/erp/floors/${floorId}/boxes/${box.id}`, { label })
      setMsg('Box renamed')
      await loadFloors()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const printLabels = async (floorIds: string[], boxIds: string[]) => {
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.post<{
        count?: number
        labels?: LocationLabelRow[]
      }>('/api/reseller/erp/print/location-labels', { floor_ids: floorIds, box_ids: boxIds })
      const labels = res.data.labels || []
      if (!labels.length) {
        setErr('No QR labels to download')
        return
      }
      const downloaded = await downloadLocationQrImages(labels)
      if (downloaded > 0) {
        setMsg(`Downloaded ${downloaded} QR image(s) — check your Downloads folder.`)
      } else {
        setErr('Could not download QR images — check your connection and try again.')
      }
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const runLookup = async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLookupBusy(true)
    setErr(null)
    try {
      const res = await axios.get<LookupResult>('/api/reseller/erp/floors/lookup', {
        params: { q: trimmed },
      })
      setLookupResult(res.data)
      setLookupQ('')
    } catch (e) {
      setErr(erpErr(e))
      setLookupResult(null)
    } finally {
      setLookupBusy(false)
    }
  }

  const addTransferScan = () => {
    const bc = transferScanInput.trim().toUpperCase()
    if (!bc) return
    setTransferScans((prev) => (prev.includes(bc) ? prev : [...prev, bc]))
    setTransferScanInput('')
  }

  const runTransfer = async () => {
    if (!transferFloorId) {
      setErr('Choose a destination floor')
      return
    }
    if (!transferScans.length) {
      setErr('Scan at least one barcode to transfer')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.post<{ transferred: number }>('/api/reseller/erp/floors/transfer', {
        barcodes: transferScans,
        floor_id: transferFloorId,
        box_id: transferBoxId || null,
      })
      setMsg(`Transferred ${res.data.transferred} piece(s)`)
      setTransferScans([])
      await loadFloors()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const tabBtn = (id: Tab, label: string, Icon: typeof Building2) => (
    <button
      type="button"
      key={id}
      className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold sm:flex-none sm:px-4 ${
        tab === id
          ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)] text-white'
          : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]'
      }`}
      onClick={() => setTab(id)}
    >
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  )

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row">
        {tabBtn('manage', 'Floors', Building2)}
        {tabBtn('find', 'Find', Search)}
        {tabBtn('transfer', 'Transfer', Shuffle)}
      </div>

      {msg ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}

      {tab === 'manage' ? (
        <>
          <div className={erpCardCls}>
            <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Create floor</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={erpInputCls}
                placeholder="Floor name e.g. DOLLAR"
                value={newFloorName}
                onChange={(e) => setNewFloorName(e.target.value)}
              />
              <input
                className={erpInputCls}
                placeholder="Code (optional)"
                value={newFloorCode}
                onChange={(e) => setNewFloorCode(e.target.value.toUpperCase())}
              />
            </div>
            <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={busy} onClick={() => void createFloor()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add floor
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">Loading floors…</p>
          ) : floors.length === 0 ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No floors yet — create one above.</p>
          ) : (
            floors.map((floor) => (
              <div key={floor.id} className={erpCardCls}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{floor.name}</p>
                    <p className="text-xs font-mono text-[var(--color-jewelry-black,#1a1814)]/60">{floor.code}</p>
                    <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                      {floor.piece_count ?? 0} pcs · net {floor.net_weight_gm ?? 0} g · gross{' '}
                      {floor.gross_weight_gm ?? 0} g
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={erpBtnGhost}
                      disabled={busy}
                      title="Rename floor"
                      onClick={() => void renameFloor(floor)}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      disabled={busy}
                      onClick={() => void printLabels([floor.id], [])}
                    >
                      <Download className="size-4" />
                      Download floor QR
                    </button>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() => setExpandedFloor(expandedFloor === floor.id ? null : floor.id)}
                    >
                      <Package className="size-4" />
                      Boxes ({floor.boxes.length})
                    </button>
                  </div>
                </div>

                {expandedFloor === floor.id ? (
                  <div className="mt-4 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        className={erpInputCls}
                        placeholder={`Box code e.g. ${floor.code}-BOX1`}
                        value={newBoxCode[floor.id] || ''}
                        onChange={(e) =>
                          setNewBoxCode((prev) => ({ ...prev, [floor.id]: e.target.value.toUpperCase() }))
                        }
                      />
                      <button
                        type="button"
                        className={erpBtnPrimary}
                        disabled={busy}
                        onClick={() => void createBox(floor.id)}
                      >
                        <Plus className="size-4" />
                        Add box
                      </button>
                    </div>
                    {floor.boxes.length === 0 ? (
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">No boxes — assign pieces to floor only, or add a box.</p>
                    ) : (
                      <ul className="space-y-2">
                        {floor.boxes.map((box) => (
                          <li
                            key={box.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]/50 px-3 py-2"
                          >
                            <div>
                              <p className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                                {box.label || box.code}
                              </p>
                              <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                                {box.piece_count ?? 0} pcs · net {box.net_weight_gm ?? 0} g
                              </p>
                            </div>
                            <button
                              type="button"
                              className={erpBtnGhost}
                              disabled={busy}
                              title="Rename box"
                              onClick={() => void renameBox(floor.id, box)}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className={erpBtnGhost}
                              disabled={busy}
                              onClick={() => void printLabels([], [box.id])}
                            >
                              <Download className="size-4" />
                              Download box QR
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </>
      ) : null}

      {tab === 'find' ? (
        <div className={erpCardCls}>
          <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Find floor / box / product</p>
          <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan a floor/box QR, type a box code, or scan a product barcode to see where it belongs.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={erpInputCls}
              placeholder="Scan QR, box code, or barcode…"
              value={lookupQ}
              onChange={(e) => setLookupQ(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runLookup(lookupQ)
              }}
            />
            <button
              type="button"
              className={erpBtnPrimary}
              disabled={lookupBusy || !lookupQ.trim()}
              onClick={() => void runLookup(lookupQ)}
            >
              {lookupBusy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              Lookup
            </button>
          </div>
          {lookupResult ? (
            <div className="mt-4 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 text-sm text-[var(--color-jewelry-black,#1a1814)]">
              {!lookupResult.found ? (
                <p>No match for {lookupResult.query || lookupQ}.</p>
              ) : lookupResult.kind === 'piece' && lookupResult.piece ? (
                <div className="space-y-1">
                  <p className="font-mono font-bold">{lookupResult.piece.barcode}</p>
                  <p>{lookupResult.piece.product_name || '—'}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
                    {lookupResult.piece.avg_weight ?? '—'} g net · {lookupResult.piece.status}
                  </p>
                  <p className="text-xs font-semibold text-emerald-800">
                    Floor: {lookupResult.piece.floor_name || lookupResult.piece.floor_code || 'Not assigned'}
                    {lookupResult.piece.box_code ? ` · Box: ${lookupResult.piece.box_code}` : ''}
                  </p>
                </div>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  <p className="font-semibold">
                    {lookupResult.kind === 'box'
                      ? lookupResult.box?.label || lookupResult.box?.code
                      : lookupResult.floor?.name}
                  </p>
                  <p className="text-xs">
                    {lookupResult.stats?.piece_count ?? 0} pieces · net {lookupResult.stats?.net_weight_gm ?? 0} g ·
                    gross {lookupResult.stats?.gross_weight_gm ?? 0} g
                  </p>
                  {(lookupResult.pieces || []).map((p) => (
                    <p key={p.barcode} className="text-xs font-mono text-[var(--color-jewelry-black,#1a1814)]/75">
                      {p.barcode} · {p.product_name || '—'} · {p.avg_weight ?? '—'} g
                    </p>
                  ))}
                  {(lookupResult.pieces?.length ?? 0) > 0 ? (
                    <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                      Showing all {lookupResult.pieces?.length ?? 0} piece(s)
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'transfer' ? (
        <div className={erpCardCls}>
          <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Transfer stock to floor</p>
          <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan many barcodes, pick destination floor/box, then transfer all in one go.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={erpInputCls}
              value={transferFloorId}
              onChange={(e) => {
                setTransferFloorId(e.target.value)
                setTransferBoxId('')
              }}
            >
              <option value="">Choose floor…</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              className={erpInputCls}
              value={transferBoxId}
              onChange={(e) => setTransferBoxId(e.target.value)}
              disabled={!transferFloorId}
            >
              <option value="">Floor only (no box)</option>
              {transferBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={erpInputCls}
              placeholder="Scan barcode…"
              value={transferScanInput}
              onChange={(e) => setTransferScanInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTransferScan()
              }}
            />
            <button type="button" className={erpBtnGhost} onClick={addTransferScan}>
              Add
            </button>
          </div>
          {transferScans.length > 0 ? (
            <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
              Queued: {transferScans.join(', ')}
            </p>
          ) : null}
          <button type="button" className={`${erpBtnPrimary} mt-4`} disabled={busy} onClick={() => void runTransfer()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
            Transfer {transferScans.length > 0 ? `(${transferScans.length})` : ''}
          </button>
        </div>
      ) : null}
    </div>
  )
}
