'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  draftsEqual,
  pieceToRowDraft,
  rowDraftToApiPayload,
  SCALE_CAPTURE_FIELDS,
  STOCK_EDITOR_COLUMNS,
  computeNetWeightFromValues,
  computeBagWtFromValues,
  shouldRecalcNetWeight,
  shouldRecalcBagWt,
  type StockEditableField,
  type StockRowDraft,
} from '@/lib/reseller-erp-stock-editor'
import type { ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { ErpWeighingScaleBar } from '@/components/reseller/erp/ErpWeighingScaleBar'
import { ErpRfidLinkDialog } from '@/components/reseller/erp/ErpRfidLinkDialog'
import { printStockLabels, type PrintLabelPieceOverride } from '@/lib/erp-print-labels'
import { Check, Loader2, MapPin, Radio, RotateCcw, Save, Tag, Trash2 } from 'lucide-react'

type FloorOption = {
  id: string
  name: string
  code: string
  boxes: { id: string; code: string; label?: string | null }[]
}

const cellCls =
  'kc-batch-cell-input w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:bg-white focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15'

const scaleCellCls =
  'kc-batch-cell-input w-full min-w-0 rounded-lg border border-emerald-200/80 bg-emerald-50/40 px-1.5 py-1 text-xs font-semibold tabular-nums text-emerald-900 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20'

type ScaleFocus = { rowId: number; field: StockEditableField }

function cellKey(rowId: number, field: StockEditableField) {
  return `${rowId}:${field}`
}

function effectiveWeightValue(
  row: StockRowDraft,
  field: StockEditableField,
  scaleFocus: ScaleFocus | null,
  scaleConnected: boolean,
  liveWeight: number | null,
): string {
  const isFocused =
    scaleFocus?.rowId === row.id &&
    scaleFocus.field === field &&
    scaleConnected &&
    SCALE_CAPTURE_FIELDS.includes(field)
  if (isFocused && liveWeight != null && Number.isFinite(liveWeight)) {
    return liveWeight.toFixed(3)
  }
  return row.values[field]?.trim() || ''
}

function overrideForWeightField(
  field: StockEditableField,
  weight: number,
): PrintLabelPieceOverride {
  if (field === 'gross_weight') return { gross_weight: weight }
  if (field === 'chain_wt_only') return { chain_wt_only: weight }
  if (field === 'pendant_wt_only') return { pendant_wt_only: weight }
  if (field === 'earring_wt_only') return { earring_wt_only: weight }
  return { avg_weight: weight }
}

function parseDraftNumber(raw: string | undefined): number | undefined {
  const v = raw?.trim()
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Merge unsaved row values so smart PRN rules see gross, bag wt, stone charges, etc. */
function draftToPrintOverride(
  row: StockRowDraft,
  field: StockEditableField,
  weight: number,
): PrintLabelPieceOverride {
  const nextValues = { ...row.values }
  if (field === 'gross_weight') nextValues.gross_weight = weight.toFixed(3)
  else if (field === 'avg_weight') nextValues.avg_weight = weight.toFixed(3)
  else if (field === 'bag_wt') nextValues.bag_wt = weight.toFixed(3)
  else if (field === 'chain_wt_only') nextValues.chain_wt_only = weight.toFixed(3)
  else if (field === 'pendant_wt_only') nextValues.pendant_wt_only = weight.toFixed(3)
  else if (field === 'earring_wt_only') nextValues.earring_wt_only = weight.toFixed(3)

  const base = overrideForWeightField(field, weight)
  const ov: PrintLabelPieceOverride = { ...base }
  const net = computeNetWeightFromValues(nextValues)
  if (net != null) {
    ov.avg_weight = Number(net)
  } else if (field === 'avg_weight') {
    ov.avg_weight = weight
  }
  const bagAuto = computeBagWtFromValues(nextValues)
  if (bagAuto != null && field !== 'bag_wt') {
    nextValues.bag_wt = bagAuto
  }
  const gross = parseDraftNumber(nextValues.gross_weight)
  if (gross != null) ov.gross_weight = gross
  const bagWt = parseDraftNumber(nextValues.bag_wt)
  if (bagWt != null) ov.bag_wt = bagWt
  const stone = parseDraftNumber(row.values.stone_charges)
  if (stone != null) ov.stone_charges = stone
  const box = parseDraftNumber(row.values.box_charges)
  if (box != null) ov.box_charges = box
  const wastage = parseDraftNumber(row.values.wastage_pct)
  if (wastage != null) ov.wastage_pct = wastage
  const mc = parseDraftNumber(row.values.mc_rate)
  if (mc != null) ov.mc_rate = mc
  if (row.values.mc_type?.trim()) ov.mc_type = row.values.mc_type.trim()
  if (row.values.metal_type?.trim()) ov.metal_type = row.values.metal_type.trim()
  if (row.values.bags?.trim()) ov.bags = row.values.bags.trim()
  const purity = parseDraftNumber(row.values.purity)
  if (purity != null) ov.purity = purity
  return ov
}

export function ErpStockExcelEditor({
  batchId,
  pieces,
  onSaved,
  scaleProfileId,
  printerProfileId,
  rfidEnabled = false,
}: {
  batchId: string
  pieces: ErpStockPiece[]
  onSaved: (rows: ErpStockPiece[]) => void
  scaleProfileId?: string | null
  printerProfileId?: string | null
  rfidEnabled?: boolean
}) {
  const [drafts, setDrafts] = useState<StockRowDraft[]>([])
  const [baseline, setBaseline] = useState<StockRowDraft[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [removeProduct, setRemoveProduct] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [liveWeight, setLiveWeight] = useState<number | null>(null)
  const [scaleConnected, setScaleConnected] = useState(false)
  const [scaleFocus, setScaleFocus] = useState<ScaleFocus | null>(null)
  const [printingLabel, setPrintingLabel] = useState(false)
  const [rfidDialogOpen, setRfidDialogOpen] = useState(false)
  const [rfidTargetRowId, setRfidTargetRowId] = useState<number | null>(null)
  const [rfidInput, setRfidInput] = useState('')
  const [rfidLinkBusy, setRfidLinkBusy] = useState(false)
  const [floors, setFloors] = useState<FloorOption[]>([])
  const [assignFloorId, setAssignFloorId] = useState('')
  const [assignBoxId, setAssignBoxId] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [bulkMcSlabR, setBulkMcSlabR] = useState('')
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  useEffect(() => {
    void axios
      .get<{ floors: FloorOption[] }>('/api/reseller/erp/floors')
      .then((res) => setFloors(res.data.floors || []))
      .catch(() => {})
  }, [])

  const assignBoxes = useMemo(() => {
    const f = floors.find((x) => x.id === assignFloorId)
    return f?.boxes || []
  }, [floors, assignFloorId])

  const assignSelectedToFloor = async () => {
    if (!assignFloorId || selected.size === 0) return
    setAssignBusy(true)
    setError(null)
    try {
      await axios.post('/api/reseller/erp/floors/assign', {
        piece_ids: Array.from(selected),
        floor_id: assignFloorId,
        box_id: assignBoxId || null,
      })
      setMessage(`Assigned ${selected.size} piece(s) to floor`)
      setSelected(new Set())
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setAssignBusy(false)
    }
  }

  const productNames = useMemo(() => {
    const names = new Set<string>()
    for (const p of pieces) {
      const n = p.item_code || p.product_name
      if (n) names.add(n)
    }
    return Array.from(names).sort()
  }, [pieces])

  useEffect(() => {
    const next = pieces.map(pieceToRowDraft)
    setDrafts(next)
    setBaseline(next)
    setSelected(new Set())
    setMessage(null)
    setError(null)
    setScaleFocus(null)
  }, [pieces])

  const dirtyCount = useMemo(() => {
    let n = 0
    for (let i = 0; i < drafts.length; i++) {
      if (baseline[i] && !draftsEqual(drafts[i], baseline[i])) n++
    }
    return n
  }, [drafts, baseline])

  const setCell = useCallback((rowId: number, field: StockEditableField, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== rowId) return d
        const nextValues = { ...d.values, [field]: value }
        if (shouldRecalcNetWeight(field)) {
          const net = computeNetWeightFromValues(nextValues)
          if (net != null) nextValues.avg_weight = net
        }
        if (shouldRecalcBagWt(field)) {
          const bag = computeBagWtFromValues(nextValues)
          if (bag != null) nextValues.bag_wt = bag
        }
        return { ...d, values: nextValues }
      }),
    )
    setMessage(null)
    setError(null)
  }, [])

  const applyBulkMcSlabR = () => {
    const n = Number(bulkMcSlabR)
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid MCRateSlabR value')
      return
    }
    const val = String(n)
    const targetIds =
      selected.size > 0 ? selected : new Set(drafts.filter((d) => d.status !== 'sold').map((d) => d.id))
    if (!targetIds.size) {
      setError('No rows to update')
      return
    }
    setDrafts((prev) =>
      prev.map((d) =>
        targetIds.has(d.id) ? { ...d, values: { ...d.values, mc_rate_slab_r: val } } : d,
      ),
    )
    setMessage(`Set MCRateSlabR = ${val} on ${targetIds.size} row(s) — click Save edits.`)
    setError(null)
  }

  const focusCell = useCallback((rowId: number, field: StockEditableField) => {
    const el = inputRefs.current.get(cellKey(rowId, field))
    el?.focus()
    el?.select()
    setScaleFocus({ rowId, field })
  }, [])

  const nextScaleRow = useCallback(
    (fromRowId: number, field: StockEditableField): number | null => {
      const idx = drafts.findIndex((d) => d.id === fromRowId)
      if (idx < 0) return null
      for (let i = idx + 1; i < drafts.length; i++) {
        if (drafts[i].status !== 'sold') return drafts[i].id
      }
      return null
    },
    [drafts],
  )

  const commitScaleWeight = useCallback(
    (rowId: number, field: StockEditableField) => {
      if (liveWeight == null || !Number.isFinite(liveWeight)) {
        setMessage('Waiting for stable weight from scale…')
        return false
      }
      setCell(rowId, field, liveWeight.toFixed(3))
      const nextId = nextScaleRow(rowId, field)
      if (nextId != null) {
        focusCell(nextId, field)
        setMessage(`Saved ${liveWeight.toFixed(3)} g — next row ready. Press F1 to print label.`)
      } else {
        setScaleFocus(null)
        setMessage(`Saved ${liveWeight.toFixed(3)} g — last row. Press F1 to print or Save edits.`)
      }
      return true
    },
    [focusCell, liveWeight, nextScaleRow, setCell],
  )

  const persistRowWeight = useCallback(
    async (rowId: number, field: StockEditableField, weightText: string) => {
      const row = drafts.find((d) => d.id === rowId)
      if (!row) return
      const payload = rowDraftToApiPayload({
        ...row,
        values: { ...row.values, [field]: weightText },
      })
      try {
        const res = await axios.put<{ pieces: ErpStockPiece[] }>(
          `/api/reseller/erp/stock-pieces/batches/${batchId}/rows`,
          { rows: [payload] },
        )
        const updated = res.data.pieces || []
        if (updated.length) {
          onSaved(updated)
        }
      } catch {
        /* weight stays in draft until Save edits */
      }
    },
    [batchId, drafts, onSaved],
  )

  const printLabelAndNext = useCallback(
    async (rowId: number, field: StockEditableField) => {
      if (printingLabel) return
      const row = drafts.find((d) => d.id === rowId)
      if (!row || row.status === 'sold') return

      const weightStr = effectiveWeightValue(row, field, scaleFocus, scaleConnected, liveWeight)
      const weight = Number(weightStr)
      if (!weightStr || !Number.isFinite(weight) || weight <= 0) {
        setError('Enter weight first (scale or type manually), then press F1.')
        return
      }

      const weightText = weight.toFixed(3)
      setCell(rowId, field, weightText)
      setPrintingLabel(true)
      setError(null)
      try {
        const result = await printStockLabels({
          pieceIds: [rowId],
          pieceOverrides: { [rowId]: draftToPrintOverride(row, field, weight) },
          printerProfileId: printerProfileId ?? null,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }

        void persistRowWeight(rowId, field, weightText)

        const nextId = nextScaleRow(rowId, field)
        if (nextId != null) {
          focusCell(nextId, field)
          setMessage(`${result.message} — next row.`)
        } else {
          setScaleFocus(null)
          setMessage(`${result.message} — last row.`)
        }
      } catch (e) {
        setError(erpErr(e))
      } finally {
        setPrintingLabel(false)
      }
    },
    [
      drafts,
      focusCell,
      liveWeight,
      nextScaleRow,
      persistRowWeight,
      printerProfileId,
      printingLabel,
      scaleConnected,
      scaleFocus,
      setCell,
    ],
  )

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const deletable = drafts.filter((d) => d.status !== 'sold').map((d) => d.id)
    if (selected.size === deletable.length) setSelected(new Set())
    else setSelected(new Set(deletable))
  }

  const resetAll = () => {
    setDrafts(baseline.map((b) => ({ ...b, values: { ...b.values } })))
    setMessage(null)
    setError(null)
  }

  const refreshPieces = async () => {
    const res = await axios.get<{ pieces: ErpStockPiece[] }>(
      `/api/reseller/erp/stock-pieces/batches/${batchId}`,
    )
    onSaved(res.data.pieces || [])
  }

  const save = async () => {
    if (saving || dirtyCount === 0) return
    setSaving(true)
    setError(null)
    try {
      const dirty = drafts.filter((d, i) => baseline[i] && !draftsEqual(d, baseline[i]))
      const res = await axios.put<{ pieces: ErpStockPiece[] }>(
        `/api/reseller/erp/stock-pieces/batches/${batchId}/rows`,
        { rows: dirty.map(rowDraftToApiPayload) },
      )
      onSaved(res.data.pieces || [])
      setMessage(`Saved ${dirty.length} row(s).`)
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setSaving(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.size || deleting) return
    if (
      !confirm(
        `Delete ${selected.size} tag(s) and remove those pieces from stock? This cannot be undone.`,
      )
    )
      return
    setDeleting(true)
    try {
      await axios.delete('/api/reseller/erp/stock-pieces', {
        data: { ids: Array.from(selected), batch_id: batchId },
      })
      await refreshPieces()
      setMessage(`Deleted ${selected.size} tag(s) from stock.`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const deleteByProduct = async () => {
    const name = removeProduct.trim()
    if (!name || deleting) return
    const count = pieces.filter(
      (p) =>
        p.status !== 'sold' &&
        (p.item_code === name || p.product_name === name),
    ).length
    if (!count) {
      alert('No in-stock pieces for that product in this batch.')
      return
    }
    if (!confirm(`Remove all ${count} piece(s) of "${name}" from this batch?`)) return
    setDeleting(true)
    try {
      await axios.delete('/api/reseller/erp/stock-pieces', {
        data: { item_code: name, batch_id: batchId },
      })
      await refreshPieces()
      setRemoveProduct('')
      setMessage(`Removed ${count} piece(s) of ${name}.`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const deleteTag = async (row: StockRowDraft) => {
    if (row.status === 'sold' || deleting) return
    const tag = row.values.barcode?.trim() || `#${row.id}`
    if (
      !confirm(
        `Delete tag "${tag}" and remove this piece from stock? Use this when the label was printed by mistake or the item was sold manually.`,
      )
    )
      return
    setDeleting(true)
    setError(null)
    try {
      await axios.delete('/api/reseller/erp/stock-pieces', {
        data: { ids: [row.id], batch_id: batchId },
      })
      await refreshPieces()
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(row.id)
        return next
      })
      setMessage(`Deleted tag ${tag} from stock.`)
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const openRfidDialog = (row: StockRowDraft) => {
    if (row.status === 'sold') return
    setRfidTargetRowId(row.id)
    setRfidInput(row.rfid_tag?.trim() || '')
    setRfidDialogOpen(true)
    setError(null)
  }

  const rfidTargetRow = useMemo(
    () => (rfidTargetRowId != null ? drafts.find((d) => d.id === rfidTargetRowId) : null),
    [drafts, rfidTargetRowId],
  )

  const linkRfidAndPrint = useCallback(async () => {
    if (!rfidTargetRowId || rfidLinkBusy) return
    const tag = rfidInput.trim().toUpperCase()
    if (!tag) return
    const row = drafts.find((d) => d.id === rfidTargetRowId)
    if (!row || row.status === 'sold') return

    setRfidLinkBusy(true)
    setError(null)
    try {
      await axios.post(`/api/reseller/erp/stock-pieces/${rfidTargetRowId}/link-rfid`, {
        rfid_tag: tag,
      })

      const result = await printStockLabels({
        pieceIds: [rfidTargetRowId],
        printerProfileId: printerProfileId ?? null,
      })
      if (!result.ok) {
        setError(result.message)
        await refreshPieces()
        return
      }

      await refreshPieces()
      setRfidInput('')

      const nextId = nextScaleRow(rfidTargetRowId, 'avg_weight')
      if (nextId != null) {
        focusCell(nextId, 'avg_weight')
        setRfidTargetRowId(nextId)
        setRfidDialogOpen(true)
        setMessage(`${result.message} · RFID ${tag} linked — next piece.`)
      } else {
        setRfidDialogOpen(false)
        setRfidTargetRowId(null)
        setScaleFocus(null)
        setMessage(`${result.message} · RFID ${tag} linked.`)
      }
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setRfidLinkBusy(false)
    }
  }, [
    focusCell,
    nextScaleRow,
    printerProfileId,
    rfidInput,
    rfidLinkBusy,
    rfidTargetRowId,
    drafts,
  ])

  const applyScaleWeight = (grams: number) => {
    const targetId =
      scaleFocus?.rowId ??
      (selected.size === 1 ? Array.from(selected)[0] : drafts.find((d) => d.status !== 'sold')?.id)
    const field = scaleFocus?.field ?? 'avg_weight'
    if (!targetId) {
      alert('Click a weight cell (Wt, Gross, Chain, etc.) or select a row first.')
      return
    }
    setCell(targetId, field, grams.toFixed(3))
    setMessage(`Weight ${grams.toFixed(3)} g applied — click Save edits.`)
  }

  const displayCellValue = (row: StockRowDraft, field: StockEditableField) => {
    const saved = row.values[field]
    const isFocused =
      scaleFocus?.rowId === row.id &&
      scaleFocus.field === field &&
      scaleConnected &&
      SCALE_CAPTURE_FIELDS.includes(field)
    if (isFocused && liveWeight != null) return liveWeight.toFixed(3)
    return saved
  }

  return (
    <div className="space-y-3">
      <ErpWeighingScaleBar
        scaleProfileId={scaleProfileId ?? null}
        onApplyWeight={applyScaleWeight}
        onLiveWeight={setLiveWeight}
        onConnectionChange={setScaleConnected}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={erpBtnPrimary} disabled={saving || dirtyCount === 0} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save edits {dirtyCount > 0 ? `(${dirtyCount})` : ''}
        </button>
        <button
          type="button"
          className={erpBtnGhost}
          onClick={resetAll}
          disabled={dirtyCount === 0}
        >
          <RotateCcw className="size-4" />
          Reset
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 disabled:opacity-50"
          disabled={deleting || selected.size === 0}
          onClick={() => void deleteSelected()}
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete selected tags {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
        {message ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="size-3.5" />
            {message}
          </span>
        ) : null}
        {printingLabel ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/55">
            <Loader2 className="size-3.5 animate-spin" />
            Printing label…
          </span>
        ) : null}
        {error ? <span className="text-xs font-medium text-rose-600">{error}</span> : null}
        <span className="hidden h-6 w-px bg-black/10 sm:inline" aria-hidden />
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
          <span className="whitespace-nowrap font-semibold uppercase tracking-wide">MC R all</span>
          <input
            className={`${erpInputCls} !min-h-[36px] w-16 py-1 text-center text-xs`}
            inputMode="decimal"
            placeholder="24"
            value={bulkMcSlabR}
            onChange={(e) => setBulkMcSlabR(e.target.value)}
          />
          <button type="button" className={erpBtnGhost} onClick={applyBulkMcSlabR}>
            Apply
          </button>
        </label>
      </div>

      <div className={`${erpCardCls} flex flex-wrap items-end gap-2`}>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Assign to floor {selected.size > 0 ? `(${selected.size})` : ''}
          </label>
          <select
            className={erpInputCls}
            value={assignFloorId}
            onChange={(e) => {
              setAssignFloorId(e.target.value)
              setAssignBoxId('')
            }}
          >
            <option value="">Choose floor…</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Box (optional)
          </label>
          <select
            className={erpInputCls}
            value={assignBoxId}
            onChange={(e) => setAssignBoxId(e.target.value)}
            disabled={!assignFloorId}
          >
            <option value="">Floor only</option>
            {assignBoxes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={erpBtnPrimary}
          disabled={assignBusy || !assignFloorId || selected.size === 0}
          onClick={() => void assignSelectedToFloor()}
        >
          {assignBusy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Assign floor
        </button>
      </div>

      <div className={`${erpCardCls} flex flex-wrap items-end gap-2`}>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Remove all of product
          </label>
          <select
            className={erpInputCls}
            value={removeProduct}
            onChange={(e) => setRemoveProduct(e.target.value)}
          >
            <option value="">Choose product…</option>
            {productNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={erpBtnGhost}
          disabled={!removeProduct.trim() || deleting}
          onClick={() => void deleteByProduct()}
        >
          <Trash2 className="size-4" />
          Remove category
        </button>
      </div>

      <div className={`${erpCardCls} kc-batch-excel-editor overflow-x-auto p-0`}>
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]">
              <th className="sticky left-0 z-10 bg-[var(--color-slate-900,#faf8f4)] px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === drafts.filter((d) => d.status !== 'sold').length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="sticky left-8 z-10 bg-[var(--color-slate-900,#faf8f4)] px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                #
              </th>
              <th className="px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">Status</th>
              {STOCK_EDITOR_COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                  {col.shortLabel || col.label}
                </th>
              ))}
              <th className="sticky right-0 z-10 whitespace-nowrap bg-[var(--color-slate-900,#faf8f4)] px-2 py-2 font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                Tag
              </th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((row, idx) => {
              const isDirty = baseline[idx] && !draftsEqual(row, baseline[idx])
              const readOnly = row.status === 'sold'
              return (
                <tr
                  key={row.id}
                  className={`border-b border-[var(--color-slate-700,#e8e4df)]/60 ${isDirty ? 'bg-[var(--kc-accent,#c41e3a)]/[0.04]' : ''} ${readOnly ? 'opacity-60' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-white px-2 py-1">
                    {!readOnly ? (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select row ${idx + 1}`}
                      />
                    ) : null}
                  </td>
                  <td className="sticky left-8 z-10 bg-white px-2 py-1 tabular-nums text-[var(--color-jewelry-black,#1a1814)]/45">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1 capitalize text-[var(--color-jewelry-black,#1a1814)]/55">{row.status.replace('_', ' ')}</td>
                  {STOCK_EDITOR_COLUMNS.map((col) => {
                    const isScaleField = !!col.scaleCapture
                    const isFocused =
                      scaleFocus?.rowId === row.id && scaleFocus.field === col.key && scaleConnected
                    return (
                      <td key={col.key} className="min-w-[72px] px-1 py-0.5">
                        <input
                          ref={(el) => {
                            const k = cellKey(row.id, col.key)
                            if (el) inputRefs.current.set(k, el)
                            else inputRefs.current.delete(k)
                          }}
                          className={isScaleField && isFocused ? scaleCellCls : cellCls}
                          type="text"
                          inputMode={col.type === 'number' ? 'decimal' : 'text'}
                          value={displayCellValue(row, col.key)}
                          readOnly={readOnly}
                          onFocus={() => {
                            if (isScaleField && !readOnly) setScaleFocus({ rowId: row.id, field: col.key })
                          }}
                          onBlur={() => {
                            if (scaleFocus?.rowId === row.id && scaleFocus.field === col.key) {
                              setScaleFocus(null)
                            }
                          }}
                          onChange={(e) => setCell(row.id, col.key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'F1' && isScaleField && !readOnly) {
                              e.preventDefault()
                              void printLabelAndNext(row.id, col.key)
                              return
                            }
                            if (
                              e.key === 'Enter' &&
                              isScaleField &&
                              !readOnly &&
                              scaleConnected
                            ) {
                              e.preventDefault()
                              commitScaleWeight(row.id, col.key)
                            }
                          }}
                        />
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-white px-1 py-0.5">
                    {!readOnly ? (
                      rfidEnabled ? (
                        <div className="flex min-w-[88px] flex-col items-stretch gap-1">
                          {row.rfid_tag ? (
                            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-emerald-800">
                              {row.rfid_tag}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            title={row.rfid_tag ? 'Change RFID tag' : 'Link RFID tag (F1 to print)'}
                            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center gap-1 rounded-lg border border-[var(--kc-accent,#c41e3a)]/25 bg-[var(--kc-accent,#c41e3a)]/[0.06] px-2 text-[var(--kc-accent,#c41e3a)] disabled:opacity-40"
                            disabled={deleting || rfidLinkBusy}
                            onClick={() => openRfidDialog(row)}
                          >
                            <Radio className="size-3.5" />
                            <Tag className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title="Delete tag & remove from stock"
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 disabled:opacity-40"
                          disabled={deleting}
                          onClick={() => void deleteTag(row)}
                        >
                          <Tag className="size-3.5" />
                          <Trash2 className="size-3" />
                        </button>
                      )
                    ) : row.rfid_tag ? (
                      <span className="font-mono text-[10px] text-emerald-800">{row.rfid_tag}</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rfidEnabled ? (
        <ErpRfidLinkDialog
          open={rfidDialogOpen}
          onOpenChange={setRfidDialogOpen}
          barcode={rfidTargetRow?.values.barcode?.trim() || '—'}
          productName={rfidTargetRow?.values.product_name?.trim() || rfidTargetRow?.values.item_code?.trim()}
          rfidInput={rfidInput}
          onRfidInputChange={setRfidInput}
          busy={rfidLinkBusy}
          onConfirm={linkRfidAndPrint}
        />
      ) : null}
    </div>
  )
}
