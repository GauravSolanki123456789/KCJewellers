'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpStockPiece,
} from '@/components/reseller/erp/erp-ui'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Camera,
  History,
  Link2,
  Loader2,
  Plus,
  Printer,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'
import { ErpTagLabelPrintSheet } from '@/components/reseller/erp/ErpTagLabelPrintSheet'

type SplitLine = {
  id: string
  pcs: string
  weight: string
  part_label: string
  rfid_tag: string
}

function sourceHasComponents(source: ErpStockPiece): boolean {
  return [source.chain_wt_only, source.pendant_wt_only, source.earring_wt_only].some(
    (w) => Number(w) > 0,
  )
}

function splitBarcodeBase(barcode: string): string {
  const s = String(barcode || '').trim()
  const letter = s.match(/^(.*)-([A-Z])$/)
  if (letter) return letter[1]
  const numeric = s.match(/^(.*)-(\d{2})$/)
  if (!numeric) return s
  const prefix = numeric[1]
  const suffix = numeric[2]
  const hyphenCount = (s.match(/-/g) || []).length
  const paddedSplit = suffix.startsWith('0')
  if (hyphenCount >= 2 || paddedSplit || !prefix.includes('-')) return prefix
  return s
}

function previewSplitBarcode(
  sourceBarcode: string,
  splitIndex: number,
  isPartial: boolean,
): string {
  const base = splitBarcodeBase(sourceBarcode)
  if (!isPartial) {
    if (splitIndex <= 0) return sourceBarcode
    return `${base}-${String(splitIndex).padStart(2, '0')}`
  }
  return `${base}-${String(splitIndex + 1).padStart(2, '0')}`
}

function emptySplitLine(): SplitLine {
  return { id: uid(), pcs: '1', weight: '', part_label: '', rfid_tag: '' }
}

function componentSplitsFromSource(source: ErpStockPiece): SplitLine[] {
  const parts: { label: string; weight: number }[] = []
  const chain = Number(source.chain_wt_only)
  const pendant = Number(source.pendant_wt_only)
  const earring = Number(source.earring_wt_only)
  if (Number.isFinite(chain) && chain > 0) parts.push({ label: 'CHAIN', weight: chain })
  if (Number.isFinite(pendant) && pendant > 0) parts.push({ label: 'PENDANT', weight: pendant })
  if (Number.isFinite(earring) && earring > 0) parts.push({ label: 'EARRING', weight: earring })
  return parts.map((p) => ({
    id: uid(),
    pcs: '1',
    weight: p.weight.toFixed(3),
    part_label: p.label,
    rfid_tag: '',
  }))
}

type TagOperation = {
  id: number
  operation_type: string
  source_barcodes: string[]
  result_barcodes: string[]
  source_total_pcs?: number | null
  source_total_weight?: number | null
  result_total_pcs?: number | null
  result_total_weight?: number | null
  notes?: string | null
  created_at?: string
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function assignedTotals(lines: SplitLine[]) {
  let pcs = 0
  let wt = 0
  for (const l of lines) {
    if (!(Number(l.weight) > 0)) continue
    pcs += Math.max(0, parseInt(l.pcs, 10) || 0)
    wt += Number(l.weight) || 0
  }
  return { pcs, wt: round3(wt) }
}

export function ErpTagSplitWorkspace({ rfidEnabled = false }: { rfidEnabled?: boolean }) {
  const [tab, setTab] = useState<'split' | 'merge'>('split')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [scan, setScan] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ErpStockPiece | null>(null)

  const [splitLines, setSplitLines] = useState<SplitLine[]>([])
  const weightRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [mergeScan, setMergeScan] = useState('')
  const mergeScanRef = useRef<HTMLInputElement>(null)
  const [mergeTags, setMergeTags] = useState<ErpStockPiece[]>([])
  const [mergeBags, setMergeBags] = useState('')
  const [mergeBagWt, setMergeBagWt] = useState('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<TagOperation[]>([])
  const [lastResult, setLastResult] = useState<{
    barcodes: string[]
    message: string
    pieces: ErpStockPiece[]
  } | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [printPieces, setPrintPieces] = useState<ErpStockPiece[]>([])

  const focusScan = useCallback(() => {
    window.setTimeout(() => {
      if (tab === 'split') scanRef.current?.focus()
      else mergeScanRef.current?.focus()
    }, 80)
  }, [tab])

  const focusWeight = useCallback((id: string) => {
    window.setTimeout(() => {
      const el = weightRefs.current.get(id)
      el?.focus()
      el?.select()
    }, 60)
  }, [])

  useEffect(() => {
    focusScan()
  }, [tab, focusScan])

  const splitTotals = useMemo(() => assignedTotals(splitLines), [splitLines])

  const remainder = useMemo(() => {
    if (!source) return null
    const srcPcs = source.pcs ?? 1
    const srcWt = Number(source.avg_weight) || 0
    const srcGross = source.gross_weight != null ? Number(source.gross_weight) : null
    const remainPcs = Math.max(0, srcPcs - splitTotals.pcs)
    const remainWt = round3(Math.max(0, srcWt - splitTotals.wt))
    const remainGross =
      srcGross != null && srcWt > 0
        ? round3(Math.max(0, srcGross - (srcGross * splitTotals.wt) / srcWt))
        : srcGross != null
          ? round3(Math.max(0, srcGross - splitTotals.wt))
          : null
    return { pcs: remainPcs, wt: remainWt, gross: remainGross }
  }, [source, splitTotals])

  const isPartial = (remainder?.pcs ?? 0) > 0
  const canCommit =
    !!source &&
    splitLines.some((l) => Number(l.weight) > 0) &&
    (sourceHasComponents(source) || splitTotals.pcs <= (source.pcs ?? 1)) &&
    splitTotals.wt <= (Number(source.avg_weight) || 0) + 0.05

  const lookupBarcode = async (code: string) => {
    const barcode = code.trim()
    if (!barcode) return null
    const res = await axios.get<{ found: boolean; piece: ErpStockPiece | null; error?: string }>(
      '/api/reseller/erp/tags/lookup',
      { params: { barcode } },
    )
    if (!res.data.found || !res.data.piece) {
      throw new Error(res.data.error || 'Barcode not found or not in stock')
    }
    return res.data.piece
  }

  const startSplitFromPiece = (piece: ErpStockPiece) => {
    setSource(piece)
    setLastResult(null)
    setError('')
    const lines = sourceHasComponents(piece) ? componentSplitsFromSource(piece) : [emptySplitLine()]
    setSplitLines(lines)
    focusWeight(lines[0].id)
  }

  const onScanSplit = async () => {
    setError('')
    setBusy(true)
    try {
      const piece = await lookupBarcode(scan)
      if (!piece) return
      setScan('')
      startSplitFromPiece(piece)
    } catch (e) {
      setError(erpErr(e))
      focusScan()
    } finally {
      setBusy(false)
    }
  }

  const addSplitLine = (seed?: Partial<SplitLine>) => {
    if (!source) return
    const line: SplitLine = { ...emptySplitLine(), ...seed, id: uid() }
    setSplitLines((prev) => [...prev, line])
    focusWeight(line.id)
    return line
  }

  const updateSplitLine = (id: string, patch: Partial<SplitLine>) => {
    setSplitLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const removeSplitLine = (id: string) => {
    setSplitLines((prev) => {
      const next = prev.filter((l) => l.id !== id)
      return next.length ? next : [emptySplitLine()]
    })
  }

  const openPrintSheet = (pieces: ErpStockPiece[]) => {
    if (!pieces.length) return
    setPrintPieces(pieces)
    setPrintOpen(true)
  }

  const commitSplit = async (lines: SplitLine[] = splitLines) => {
    if (!source) return
    const splits = lines
      .filter((l) => Number(l.weight) > 0)
      .map((l) => ({
        pcs: Math.max(1, parseInt(l.pcs, 10) || 1),
        weight: round3(Number(l.weight) || 0),
        part_label: l.part_label.trim() || null,
        rfid_tag: l.rfid_tag.trim() || null,
      }))
    if (!splits.length) return
    setError('')
    setBusy(true)
    try {
      const res = await axios.post<{
        success: boolean
        pieces: ErpStockPiece[]
        updated_source?: ErpStockPiece | null
        remainder_on_source?: { pcs: number; weight: number; gross_weight?: number | null } | null
        source_barcode: string
        result_barcodes?: string[]
      }>('/api/reseller/erp/tags/split', {
        source_barcode: source.barcode,
        splits,
        use_suffix: true,
      })
      const newCodes = (res.data.pieces || []).map((p) => p.barcode)
      const allPieces = [
        ...(res.data.updated_source ? [res.data.updated_source] : []),
        ...res.data.pieces,
      ]
      const remain = res.data.remainder_on_source
      const msg = remain
        ? `Split complete. ${res.data.source_barcode} kept ${remain.pcs} pcs · ${remain.weight}g. New tags: ${newCodes.join(', ') || '—'}.`
        : `Split complete — ${[res.data.source_barcode, ...newCodes].filter(Boolean).join(', ')}`
      setLastResult({
        barcodes: res.data.result_barcodes || [res.data.source_barcode, ...newCodes],
        message: msg,
        pieces: allPieces,
      })
      openPrintSheet(allPieces)
      setSource(null)
      setSplitLines([])
      focusScan()
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const onWeightEnter = (idx: number) => {
    if (!source) return
    const line = splitLines[idx]
    const wt = Number(line.weight) || 0
    if (wt <= 0) return

    const srcPcs = source.pcs ?? 1
    const srcWt = Number(source.avg_weight) || 0
    const assigned = assignedTotals(splitLines)
    const remainPcsAfter = Math.max(0, srcPcs - assigned.pcs)
    const remainWtAfter = round3(Math.max(0, srcWt - assigned.wt))
    const components = sourceHasComponents(source)

    if (components) {
      if (idx < splitLines.length - 1) {
        focusWeight(splitLines[idx + 1].id)
        return
      }
      void commitSplit(splitLines)
      return
    }

    if (remainPcsAfter <= 0) {
      const next =
        remainWtAfter > 0.05
          ? splitLines.map((l, i) => (i === idx ? { ...l, weight: round3(wt + remainWtAfter).toFixed(3) } : l))
          : splitLines
      if (next !== splitLines) setSplitLines(next)
      void commitSplit(next)
      return
    }

    if (idx < splitLines.length - 1) {
      const nxt = splitLines[idx + 1]
      if (remainPcsAfter === 1 && remainWtAfter > 0 && !(Number(nxt.weight) > 0)) {
        updateSplitLine(nxt.id, { weight: remainWtAfter.toFixed(3) })
      }
      focusWeight(nxt.id)
      return
    }

    addSplitLine({
      pcs: '1',
      weight: remainPcsAfter === 1 && remainWtAfter > 0 ? remainWtAfter.toFixed(3) : '',
    })
  }

  const onAddMergeTag = async () => {
    setError('')
    const code = mergeScan.trim()
    if (!code) return
    if (mergeTags.some((t) => t.barcode.toLowerCase() === code.toLowerCase())) {
      setError('Tag already in merge list')
      setMergeScan('')
      return
    }
    setBusy(true)
    try {
      const piece = await lookupBarcode(code)
      setMergeTags((prev) => [...prev, piece!])
      setMergeScan('')
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
      mergeScanRef.current?.focus()
    }
  }

  const mergeTotals = useMemo(() => {
    let pcs = 0
    let wt = 0
    let gross = 0
    for (const t of mergeTags) {
      pcs += t.pcs ?? 1
      wt += Number(t.avg_weight) || 0
      gross += Number(t.gross_weight ?? t.avg_weight) || 0
    }
    return { pcs, wt: round3(wt), gross: round3(gross) }
  }, [mergeTags])

  const commitMerge = async () => {
    if (mergeTags.length < 2) return
    setError('')
    setBusy(true)
    try {
      const res = await axios.post<{ success: boolean; new_barcode: string; piece: ErpStockPiece }>(
        '/api/reseller/erp/tags/merge',
        {
          source_barcodes: mergeTags.map((t) => t.barcode),
          pcs: mergeTotals.pcs,
          weight: mergeTotals.wt,
          gross_weight: mergeTotals.gross,
          bags: mergeBags.trim() || null,
          bag_wt: mergeBagWt.trim() ? round3(Number(mergeBagWt)) : null,
        },
      )
      setLastResult({
        barcodes: [res.data.new_barcode],
        message: `Merged into ${res.data.new_barcode} (${mergeTotals.pcs} pcs · ${mergeTotals.wt}g)`,
        pieces: [res.data.piece],
      })
      openPrintSheet([res.data.piece])
      setMergeTags([])
      setMergeBags('')
      setMergeBagWt('')
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
      focusScan()
    }
  }

  const loadHistory = async () => {
    setBusy(true)
    try {
      const res = await axios.get<{ operations: TagOperation[] }>('/api/reseller/erp/tags/operations', {
        params: { limit: 40 },
      })
      setHistory(res.data.operations || [])
      setHistoryOpen(true)
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const showPart = !!(source && sourceHasComponents(source))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">Tag Split &amp; Merge</h2>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan a tag, type the first weight, press Enter. Last piece fills remaining weight — Enter again to split
            and print.
          </p>
        </div>
        <button type="button" className={erpBtnGhost} onClick={() => void loadHistory()} disabled={busy}>
          <History className="size-4" />
          History
        </button>
      </div>

      <div className="flex gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-1">
        <button
          type="button"
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
            tab === 'split'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-white'
          }`}
          onClick={() => setTab('split')}
        >
          <Scissors className="size-4" />
          Split tag
        </button>
        <button
          type="button"
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
            tab === 'merge'
              ? 'bg-violet-700 text-white shadow-sm'
              : 'text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-white'
          }`}
          onClick={() => setTab('merge')}
        >
          <Link2 className="size-4" />
          Merge tags
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {lastResult ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Success</p>
              <p className="mt-0.5 text-xs leading-relaxed">{lastResult.message}</p>
            </div>
            {lastResult.pieces.length ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                onClick={() => openPrintSheet(lastResult.pieces)}
              >
                <Printer className="size-3.5" />
                Print labels
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'split' ? (
        <div className="space-y-4">
          {!source ? (
            <div className={erpCardCls}>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
                <Camera className="size-5 text-emerald-700" />
                Scan a barcode to start splitting
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={scanRef}
                  className={erpInputCls}
                  placeholder="Scan barcode…"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onScanSplit()
                  }}
                  disabled={busy}
                />
                <button type="button" className={erpBtnPrimary} disabled={busy || !scan.trim()} onClick={() => void onScanSplit()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Lookup
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className={erpCardCls}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Source tag</p>
                    <p className="text-base font-bold text-[var(--color-jewelry-black,#1a1814)]">{source.barcode}</p>
                    <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
                      {source.product_name || source.item_code || '—'} · {source.pcs ?? 1} pcs ·{' '}
                      {source.avg_weight ?? '—'}g
                      {source.gross_weight != null ? ` · gross ${source.gross_weight}g` : ''}
                      {source.rfid_tag ? ` · RFID ${source.rfid_tag}` : ''}
                    </p>
                    {showPart ? (
                      <p className="mt-1 text-xs text-emerald-800">
                        Components:
                        {source.chain_wt_only ? ` Chain ${source.chain_wt_only}g` : ''}
                        {source.pendant_wt_only ? ` · Pendant ${source.pendant_wt_only}g` : ''}
                        {source.earring_wt_only ? ` · Earring ${source.earring_wt_only}g` : ''}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      setSource(null)
                      setSplitLines([])
                      focusScan()
                    }}
                  >
                    <X className="size-4" />
                    Clear
                  </button>
                </div>
              </div>

              <div className={erpCardCls}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    Split pieces
                    <span className="ml-2 text-xs font-normal text-[var(--color-jewelry-black,#1a1814)]/50">
                      Default 1 pc each · original tag keeps leftover pcs
                    </span>
                  </p>
                </div>

                <div className="space-y-3">
                  {splitLines.map((line, idx) => (
                    <div
                      key={line.id}
                      className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-emerald-900">
                          {previewSplitBarcode(source.barcode, idx, isPartial)}
                          <span className="ml-2 font-normal text-[var(--color-jewelry-black,#1a1814)]/45">
                            {idx === 0 && !isPartial ? '(this tag)' : '(new tag)'}
                          </span>
                        </p>
                        {splitLines.length > 1 ? (
                          <button
                            type="button"
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={() => removeSplitLine(line.id)}
                            aria-label="Remove split line"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {showPart ? (
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                              Part
                            </span>
                            <input
                              className={erpInputCls}
                              placeholder="CHAIN / PENDANT / EARRING"
                              value={line.part_label}
                              onChange={(e) => updateSplitLine(line.id, { part_label: e.target.value.toUpperCase() })}
                            />
                          </label>
                        ) : null}
                        <label className="block text-xs">
                          <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]">PCS</span>
                          <input
                            className={erpInputCls}
                            inputMode="numeric"
                            value={line.pcs}
                            onChange={(e) => updateSplitLine(line.id, { pcs: e.target.value.replace(/\D/g, '') })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                focusWeight(line.id)
                              }
                            }}
                          />
                        </label>
                        <label className="block text-xs">
                          <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                            Weight (g)
                          </span>
                          <input
                            ref={(el) => {
                              if (el) weightRefs.current.set(line.id, el)
                              else weightRefs.current.delete(line.id)
                            }}
                            className={erpInputCls}
                            inputMode="decimal"
                            value={line.weight}
                            onChange={(e) => updateSplitLine(line.id, { weight: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                onWeightEnter(idx)
                              }
                            }}
                          />
                        </label>
                        {rfidEnabled && (isPartial || idx > 0) ? (
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                              RFID tag
                            </span>
                            <input
                              className={erpInputCls}
                              placeholder="e.g. B0298"
                              value={line.rfid_tag}
                              onChange={(e) =>
                                updateSplitLine(line.id, { rfid_tag: e.target.value.toUpperCase() })
                              }
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {remainder ? (
                  <div
                    className={`mt-4 rounded-xl px-3 py-2.5 text-sm ${
                      remainder.pcs === 0 && remainder.wt <= 0.05
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-950'
                        : 'border border-amber-200/80 bg-amber-50/90 text-amber-950'
                    }`}
                  >
                    {remainder.pcs === 0 && remainder.wt <= 0.05 ? (
                      <span className="font-semibold">All pieces assigned — press Enter or Split to finish.</span>
                    ) : (
                      <>
                        <span className="font-semibold">Remaining on {source.barcode}: </span>
                        {remainder.pcs} pcs · {remainder.wt}g
                        {remainder.gross != null ? ` · gross ${remainder.gross}g` : ''}
                        <span className="mt-1 block text-xs opacity-80">
                          Press Enter to add the next piece, or Split now to keep this remainder on the original tag.
                        </span>
                      </>
                    )}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={`${erpBtnPrimary} mt-4 w-full sm:w-auto`}
                  disabled={busy || !canCommit}
                  onClick={() => void commitSplit()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
                  Split &amp; print labels
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className={erpCardCls}>
            <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Scan tag to add</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                ref={mergeScanRef}
                className={erpInputCls}
                placeholder="Scan barcode…"
                value={mergeScan}
                onChange={(e) => setMergeScan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onAddMergeTag()
                }}
                disabled={busy}
              />
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                disabled={busy || !mergeScan.trim()}
                onClick={() => void onAddMergeTag()}
              >
                <Plus className="size-4" />
                Add
              </button>
            </div>
          </div>

          <div className={erpCardCls}>
            <p className="mb-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Tags to merge ({mergeTags.length})
            </p>
            {mergeTags.length === 0 ? (
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No tags added. Scan tags above to merge.</p>
            ) : (
              <ul className="space-y-2">
                {mergeTags.map((t) => (
                  <li
                    key={t.barcode}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2"
                  >
                    <div>
                      <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{t.barcode}</p>
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                        {t.pcs ?? 1} pcs · {t.avg_weight ?? '—'}g
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-600 hover:underline"
                      onClick={() => setMergeTags((prev) => prev.filter((x) => x.barcode !== t.barcode))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {mergeTags.length >= 2 ? (
              <p className="mt-3 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
                Total: {mergeTotals.pcs} pcs · {mergeTotals.wt}g
                {mergeTotals.gross ? ` · gross ${mergeTotals.gross}g` : ''}
              </p>
            ) : null}

            <button
              type="button"
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:w-auto"
              disabled={busy || mergeTags.length < 2}
              onClick={() => void commitMerge()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Merge tags &amp; print new label
            </button>
          </div>
        </div>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--color-jewelry-black,#1a1814)]">Tag operation history</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">No operations yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((op) => (
                <li key={op.id} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2 text-xs">
                  <p className="font-bold text-emerald-800">{op.operation_type}</p>
                  <p className="text-[var(--color-jewelry-black,#1a1814)]/70">
                    From: {(op.source_barcodes || []).join(', ') || '—'}
                  </p>
                  <p className="text-[var(--color-jewelry-black,#1a1814)]/70">
                    To: {(op.result_barcodes || []).join(', ') || '—'}
                  </p>
                  {op.created_at ? (
                    <p className="mt-1 text-[var(--color-jewelry-black,#1a1814)]/45">
                      {new Date(op.created_at).toLocaleString('en-IN')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ErpTagLabelPrintSheet
        open={printOpen}
        onOpenChange={setPrintOpen}
        pieces={printPieces}
        subtitle={
          printPieces.length
            ? `${printPieces.length} label(s) ready — thermal printer or browser print.`
            : null
        }
      />
    </div>
  )
}
