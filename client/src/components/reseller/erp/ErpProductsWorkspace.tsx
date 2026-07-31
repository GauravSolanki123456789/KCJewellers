'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { ErpStockExcelEditor } from '@/components/reseller/erp/ErpStockExcelEditor'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, type ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import { parseStockExcelRows } from '@/lib/reseller-erp-stock-editor'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { ArrowLeft, FileSpreadsheet, Loader2, Printer, Trash2, Upload } from 'lucide-react'

type Batch = {
  id: string
  batch_label: string
  row_count: number
  piece_count?: number
  created_at: string
}

export function ErpProductsWorkspace() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [pieces, setPieces] = useState<ErpStockPiece[]>([])
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadBatches = useCallback(async () => {
    const res = await axios.get<{ batches: Batch[] }>('/api/reseller/erp/stock-pieces/batches')
    setBatches(res.data.batches || [])
  }, [])

  const loadBatch = useCallback(async (batchId: string) => {
    const res = await axios.get<{ batch: Batch; pieces: ErpStockPiece[] }>(
      `/api/reseller/erp/stock-pieces/batches/${batchId}`,
    )
    setPieces(res.data.pieces || [])
    setActiveBatchId(batchId)
  }, [])

  useEffect(() => {
    void loadBatches().catch(() => setBatches([]))
  }, [loadBatches])

  const onFile = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const rows = parseStockExcelRows(buf)
      if (!rows.length) throw new Error('No rows in file')
      const res = await axios.post<{ batch_id: string; inserted: number; updated: number; total: number }>(
        '/api/reseller/erp/stock-pieces/bulk',
        { rows, batch_label: `Stock ${file.name.replace(/\.[^.]+$/, '')}` },
      )
      setMsg(`Uploaded ${res.data.total} piece(s) — ${res.data.inserted} new, ${res.data.updated} updated.`)
      await loadBatches()
      await loadBatch(res.data.batch_id)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const printBarcodes = async () => {
    if (!activeBatchId) return
    setPrinting(true)
    try {
      const res = await axios.post<{ results: { barcode: string; printed: boolean }[]; printerConfigured: boolean }>(
        '/api/reseller/erp/print/barcodes',
        { batch_id: activeBatchId },
      )
      const ok = res.data.results.filter((r) => r.printed).length
      if (!res.data.printerConfigured) {
        alert(`TSPL generated for ${res.data.results.length} label(s). Connect a printer in Hardware to print directly.`)
      } else {
        setMsg(`Printed ${ok} of ${res.data.results.length} label(s).`)
      }
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setPrinting(false)
    }
  }

  const deleteBatch = async () => {
    if (!activeBatchId || deleting) return
    if (!confirm(`Delete entire batch "${activeBatch?.batch_label}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await axios.delete(`/api/reseller/erp/stock-pieces/batches/${activeBatchId}`)
      setActiveBatchId(null)
      setPieces([])
      await loadBatches()
      setMsg('Batch deleted.')
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeleting(false)
    }
  }

  const activeBatch = batches.find((b) => b.id === activeBatchId)

  if (activeBatchId && activeBatch) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={erpBtnGhost}
            onClick={() => {
              setActiveBatchId(null)
              setPieces([])
            }}
          >
            <ArrowLeft className="size-4" />
            All batches
          </button>
          <h2 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{activeBatch.batch_label}</h2>
          <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{pieces.length} pieces</span>
          <button type="button" className={`${erpBtnPrimary} ml-auto`} disabled={printing} onClick={() => void printBarcodes()}>
            {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Generate barcodes
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700"
            disabled={deleting}
            onClick={() => void deleteBatch()}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete batch
          </button>
        </div>
        <ErpStockExcelEditor batchId={activeBatchId} pieces={pieces} onSaved={setPieces} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <FileSpreadsheet className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Upload stock Excel
        </div>
        <p className="mb-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Upload individual barcoded pieces (e.g. TORTOISESHRICHAKRAM-102). This is separate from catalogue Excel batches — it updates ERP stock only.
        </p>
        <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-4 py-6 transition hover:border-[var(--kc-accent,#c41e3a)]/40">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
          {busy ? (
            <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
          ) : (
            <>
              <Upload className="mb-2 size-8 text-[var(--kc-accent,#c41e3a)]" />
              <span className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Choose .xlsx or .csv</span>
            </>
          )}
        </label>
        {msg ? <p className="mt-2 text-xs font-medium text-emerald-600">{msg}</p> : null}
      </div>

      <ul className="space-y-2">
        {batches.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No stock uploads yet.
          </li>
        ) : (
          batches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className={`${erpCardCls} flex w-full items-center justify-between text-left transition hover:border-[var(--kc-accent,#c41e3a)]/35`}
                onClick={() => void loadBatch(b.id)}
              >
                <div>
                  <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{b.batch_label}</p>
                  <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                    {b.piece_count ?? b.row_count} pieces · {formatErpDateDdMmYyyy(b.created_at)}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--kc-accent,#c41e3a)]">Open</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
