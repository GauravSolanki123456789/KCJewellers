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
  bags: string
  bag_wt: string
  part_label: string
  product_name: string
  rfid_tag: string
}

const SUFFIX_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function previewSplitBarcode(sourceBarcode: string, splitIndex: number): string {
  const base = sourceBarcode.replace(/-[A-Z]$/, '')
  if (splitIndex <= 0) return base
  const letter = SUFFIX_LETTERS[splitIndex - 1] || String(splitIndex)
  return `${base}-${letter}`
}

function appendPartLabel(baseName: string, partLabel: string): string {
  const base = baseName.trim()
  const suffix = partLabel.trim().toUpperCase()
  if (!suffix) return base
  if (base.toUpperCase().endsWith(suffix)) return base
  return `${base} ${suffix}`.trim()
}

function componentSplitsFromSource(source: ErpStockPiece): SplitLine[] {
  const base = source.product_name || source.item_code || ''
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
    bags: source.bags || '',
    bag_wt: source.bag_wt != null ? String(source.bag_wt) : '',
    part_label: p.label,
    product_name: appendPartLabel(base, p.label),
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

export function ErpTagSplitWorkspace({ rfidEnabled = false }: { rfidEnabled?: boolean }) {
  const [tab, setTab] = useState<'split' | 'merge'>('split')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [scan, setScan] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<ErpStockPiece | null>(null)

  const [splitLines, setSplitLines] = useState<SplitLine[]>([])
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

  useEffect(() => {
    focusScan()
  }, [tab, focusScan])

  const splitTotals = useMemo(() => {
    let pcs = 0
    let wt = 0
    for (const l of splitLines) {
      pcs += Math.max(0, parseInt(l.pcs, 10) || 0)
      wt += Number(l.weight) || 0
    }
    return { pcs, wt: round3(wt) }
  }, [splitLines])

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

  const onScanSplit = async () => {
    setError('')
    setBusy(true)
    try {
      const piece = await lookupBarcode(scan)
      setSource(piece)
      setSplitLines([])
      setLastResult(null)
      setScan('')
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
      focusScan()
    }
  }

  const addSplitLine = () => {
    if (!source) return
    setSplitLines((prev) => [
      ...prev,
      {
        id: uid(),
        pcs: '1',
        weight: '',
        bags: source.bags || '',
        bag_wt: source.bag_wt != null ? String(source.bag_wt) : '',
        part_label: '',
        product_name: '',
        rfid_tag: '',
      },
    ])
  }

  const autoFillComponents = () => {
    if (!source) return
    const lines = componentSplitsFromSource(source)
    if (!lines.length) {
      setError('No chain / pendant / earring weights on this tag.')
      return
    }
    setSplitLines(lines)
    setError('')
  }

  const updateSplitLine = (id: string, patch: Partial<SplitLine>) => {
    setSplitLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const removeSplitLine = (id: string) => {
    setSplitLines((prev) => prev.filter((l) => l.id !== id))
  }

  const openPrintSheet = (pieces: ErpStockPiece[]) => {
    if (!pieces.length) return
    setPrintPieces(pieces)
    setPrintOpen(true)
  }

  const commitSplit = async () => {
    if (!source || !splitLines.length) return
    setError('')
    setBusy(true)
    try {
      const splits = splitLines.map((l) => ({
        pcs: Math.max(1, parseInt(l.pcs, 10) || 1),
        weight: round3(Number(l.weight) || 0),
        bags: l.bags.trim() || null,
        bag_wt: l.bag_wt.trim() ? round3(Number(l.bag_wt)) : null,
        part_label: l.part_label.trim() || null,
        product_name: l.product_name.trim() || null,
        rfid_tag: l.rfid_tag.trim() || null,
      }))
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
      const newCodes = res.data.pieces.map((p) => p.barcode)
      const allPieces = [
        ...(res.data.updated_source ? [res.data.updated_source] : []),
        ...res.data.pieces,
      ]
      const msg = res.data.remainder_on_source
        ? `Split complete — ${res.data.source_barcode} updated, new tags: ${newCodes.join(', ')}. Unassigned remainder: ${res.data.remainder_on_source.weight}g on ${res.data.source_barcode}.`
        : `Split complete — ${res.data.source_barcode}${newCodes.length ? `, ${newCodes.join(', ')}` : ''}`
      setLastResult({ barcodes: res.data.result_barcodes || [res.data.source_barcode, ...newCodes], message: msg, pieces: allPieces })
      openPrintSheet(allPieces)
      if (res.data.updated_source) {
        setSource(res.data.updated_source)
      } else if (res.data.remainder_on_source) {
        setSource({
          ...source,
          pcs: res.data.remainder_on_source.pcs,
          avg_weight: res.data.remainder_on_source.weight,
          gross_weight: res.data.remainder_on_source.gross_weight ?? source.gross_weight,
        })
      } else {
        setSource(null)
      }
      setSplitLines([])
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
      focusScan()
    }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-jewelry-black,#1a1814)]">Tag Split &amp; Merge</h2>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            Scan barcodes to split bags into pieces or merge tags into one stock label.
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
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
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
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition ${
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Done</p>
              <p className="mt-0.5 text-xs">{lastResult.message}</p>
            </div>
            {lastResult.pieces.length ? (
              <button
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
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
                  {(source.chain_wt_only || source.pendant_wt_only || source.earring_wt_only) ? (
                    <p className="mt-1 text-xs text-emerald-800">
                      Components:
                      {source.chain_wt_only ? ` Chain ${source.chain_wt_only}g` : ''}
                      {source.pendant_wt_only ? ` · Pendant ${source.pendant_wt_only}g` : ''}
                      {source.earring_wt_only ? ` · Earring ${source.earring_wt_only}g` : ''}
                    </p>
                  ) : null}
                    {source.bags ? (
                      <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Bags: {source.bags}</p>
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
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Split lines</p>
                  <div className="flex flex-wrap gap-2">
                    {(source.chain_wt_only || source.pendant_wt_only || source.earring_wt_only) ? (
                      <button type="button" className={erpBtnGhost} onClick={autoFillComponents}>
                        Auto-fill components
                      </button>
                    ) : null}
                    <button type="button" className={erpBtnGhost} onClick={addSplitLine}>
                      <Plus className="size-4" />
                      Add split
                    </button>
                  </div>
                </div>

                <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  First line stays on <span className="font-semibold">{source.barcode}</span>; extra lines become{' '}
                  {previewSplitBarcode(source.barcode, 1)}, {previewSplitBarcode(source.barcode, 2)}, …
                </p>

                {splitLines.length === 0 ? (
                  <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                    Add one or more splits — remaining pcs &amp; weight auto-calculate below.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {splitLines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-emerald-900">
                            Split #{idx + 1} → {previewSplitBarcode(source.barcode, idx)}
                          </p>
                          <button
                            type="button"
                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={() => removeSplitLine(line.id)}
                            aria-label="Remove split line"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Part</span>
                            <input
                              className={erpInputCls}
                              placeholder="CHAIN / EARRING"
                              value={line.part_label}
                              onChange={(e) => {
                                const part = e.target.value.toUpperCase()
                                updateSplitLine(line.id, {
                                  part_label: part,
                                  product_name:
                                    line.product_name ||
                                    appendPartLabel(source.product_name || source.item_code || '', part),
                                })
                              }}
                            />
                          </label>
                          <label className="block text-xs sm:col-span-2">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Product name</span>
                            <input
                              className={erpInputCls}
                              value={line.product_name}
                              onChange={(e) => updateSplitLine(line.id, { product_name: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">PCS</span>
                            <input
                              className={erpInputCls}
                              inputMode="numeric"
                              value={line.pcs}
                              onChange={(e) => updateSplitLine(line.id, { pcs: e.target.value })}
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Weight (g)</span>
                            <input
                              className={erpInputCls}
                              inputMode="decimal"
                              value={line.weight}
                              onChange={(e) => updateSplitLine(line.id, { weight: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  if (idx === splitLines.length - 1) addSplitLine()
                                }
                              }}
                            />
                          </label>
                          {rfidEnabled && idx > 0 ? (
                            <label className="block text-xs">
                              <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">RFID tag</span>
                              <input
                                className={erpInputCls}
                                placeholder="e.g. B0298"
                                value={line.rfid_tag}
                                onChange={(e) => updateSplitLine(line.id, { rfid_tag: e.target.value.toUpperCase() })}
                              />
                            </label>
                          ) : null}
                          <label className="block text-xs sm:col-span-2">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Bags</span>
                            <input
                              className={erpInputCls}
                              value={line.bags}
                              onChange={(e) => updateSplitLine(line.id, { bags: e.target.value })}
                              placeholder="e.g. 1*6 ,10*2.35"
                            />
                          </label>
                          <label className="block text-xs">
                            <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Bag Wt</span>
                            <input
                              className={erpInputCls}
                              inputMode="decimal"
                              value={line.bag_wt}
                              onChange={(e) => updateSplitLine(line.id, { bag_wt: e.target.value })}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {remainder ? (
                  <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950">
                    <span className="font-semibold">Unassigned weight: </span>
                    {remainder.wt}g
                    {remainder.gross != null ? ` · gross ${remainder.gross}g` : ''}
                    {remainder.wt <= 0.05 ? ' — ready to split' : ' — add another split line or adjust weights'}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={`${erpBtnPrimary} mt-4 w-full sm:w-auto`}
                  disabled={busy || !splitLines.length || (remainder != null && remainder.pcs < 0)}
                  onClick={() => void commitSplit()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
                  Split &amp; print new labels
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
                      className="text-rose-600 hover:underline text-xs font-semibold"
                      onClick={() => setMergeTags((prev) => prev.filter((x) => x.barcode !== t.barcode))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {mergeTags.length >= 2 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Combined bags</span>
                  <input className={erpInputCls} value={mergeBags} onChange={(e) => setMergeBags(e.target.value)} placeholder="Bag notation" />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Bag weight (g)</span>
                  <input
                    className={erpInputCls}
                    inputMode="decimal"
                    value={mergeBagWt}
                    onChange={(e) => setMergeBagWt(e.target.value)}
                  />
                </label>
              </div>
            ) : null}

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
