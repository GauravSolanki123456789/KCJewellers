'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import type { WholesaleUserFields } from '@/lib/customer-tier'
import { ErpStockExcelEditor } from '@/components/reseller/erp/ErpStockExcelEditor'
import { ErpStockExcelBuilder } from '@/components/reseller/erp/ErpStockExcelBuilder'
import { useErpWorkstationSelection } from '@/components/reseller/erp/ErpWorkstationBar'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls, type ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import {
  migrateHardwareSettings,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import { printStockLabels } from '@/lib/erp-print-labels'
import { parseStockExcelRows, downloadStockPiecesExcel } from '@/lib/reseller-erp-stock-editor'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Pencil, Printer, ScanBarcode, Trash2, Upload } from 'lucide-react'

type Batch = {
  id: string
  batch_label: string
  row_count: number
  piece_count?: number
  created_at: string
}

type ImportBatch = {
  id: string
  source_filename: string
  piece_count: number
  live_count: number
  created_at: string
}

export function ErpProductsWorkspace() {
  const auth = useAuth()
  const rfidEnabled = !!(auth.user as WholesaleUserFields | null)?.reseller_rfid_enabled
  const [batches, setBatches] = useState<Batch[]>([])
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [pieces, setPieces] = useState<ErpStockPiece[]>([])
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok')
  const [tagDeleteCode, setTagDeleteCode] = useState('')
  const [tagDeleteBusy, setTagDeleteBusy] = useState(false)
  const tagDeleteRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const appendFileRef = useRef<HTMLInputElement>(null)
  const [workstation] = useErpWorkstationSelection()
  const [hw, setHw] = useState<ErpHardwareSettings | null>(null)
  const [renameLabel, setRenameLabel] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [appendBusy, setAppendBusy] = useState(false)
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [importsLoading, setImportsLoading] = useState(false)
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null)
  const [designStyles, setDesignStyles] = useState<string[]>([])
  const [designSkus, setDesignSkus] = useState<string[]>([])
  const [designProducts, setDesignProducts] = useState<string[]>([])

  useEffect(() => {
    void axios
      .get<{ tree: { style_code: string; skus: { sku: string; product_name?: string | null }[] }[] }>(
        '/api/reseller/erp/design-master/tree',
      )
      .then((res) => {
        const tree = res.data.tree || []
        setDesignStyles(tree.map((s) => s.style_code))
        const skus = new Set<string>()
        const products = new Set<string>()
        for (const s of tree) {
          for (const sk of s.skus || []) {
            if (sk.sku) skus.add(sk.sku)
            if (sk.product_name) products.add(sk.product_name)
          }
        }
        setDesignSkus(Array.from(skus).sort())
        setDesignProducts(Array.from(products).sort())
      })
      .catch(() => {
        setDesignStyles([])
        setDesignSkus([])
        setDesignProducts([])
      })
  }, [])

  useEffect(() => {
    void axios
      .get<{ settings: { hardware?: ErpHardwareSettings } }>('/api/reseller/erp/settings')
      .then((res) => setHw(migrateHardwareSettings(res.data.settings?.hardware)))
      .catch(() => setHw(null))
  }, [])

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
    setRenameLabel(res.data.batch?.batch_label || '')
  }, [])

  const loadImports = useCallback(async (batchId: string) => {
    setImportsLoading(true)
    try {
      const res = await axios.get<{ imports: ImportBatch[] }>(
        `/api/reseller/erp/stock-pieces/batches/${batchId}/imports`,
      )
      setImports(res.data.imports || [])
    } catch {
      setImports([])
    } finally {
      setImportsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBatches().catch(() => setBatches([]))
  }, [loadBatches])

  const onFile = async (file: File, appendToBatchId?: string) => {
    const isAppend = !!appendToBatchId
    if (isAppend) setAppendBusy(true)
    else setBusy(true)
    setMsg(null)
    try {
      const buf = await file.arrayBuffer()
      const rows = parseStockExcelRows(buf)
      if (!rows.length) throw new Error('No rows in file')
      const res = await axios.post<{ batch_id: string; inserted: number; updated: number; total: number }>(
        '/api/reseller/erp/stock-pieces/bulk',
        isAppend
          ? {
              rows,
              batch_id: appendToBatchId,
              source_filename: file.name,
            }
          : { rows, batch_label: `Stock ${file.name.replace(/\.[^.]+$/, '')}`, source_filename: file.name },
      )
      setMsgTone('ok')
      setMsg(
        isAppend
          ? `Added ${res.data.total} piece(s) to batch — ${res.data.inserted} new, ${res.data.updated} updated.`
          : `Uploaded ${res.data.total} piece(s) — ${res.data.inserted} new, ${res.data.updated} updated.`,
      )
      await loadBatches()
      await loadBatch(res.data.batch_id)
      if (isAppend) await loadImports(res.data.batch_id)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      if (isAppend) {
        setAppendBusy(false)
        if (appendFileRef.current) appendFileRef.current.value = ''
      } else {
        setBusy(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
  }

  const renameBatch = async () => {
    if (!activeBatchId || renaming) return
    const label = renameLabel.trim()
    if (!label) return
    setRenaming(true)
    try {
      await axios.patch(`/api/reseller/erp/stock-pieces/batches/${activeBatchId}`, {
        batch_label: label,
      })
      await loadBatches()
      setMsgTone('ok')
      setMsg('Batch renamed.')
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      setRenaming(false)
    }
  }

  const deleteImport = async (importId: string, filename: string) => {
    if (!activeBatchId || deletingImportId) return
    if (!confirm(`Delete Excel upload "${filename}" and remove its pieces from this batch?`)) return
    setDeletingImportId(importId)
    try {
      await axios.delete(
        `/api/reseller/erp/stock-pieces/batches/${activeBatchId}/imports/${importId}`,
      )
      await loadBatch(activeBatchId)
      await loadImports(activeBatchId)
      await loadBatches()
      setMsgTone('ok')
      setMsg(`Removed upload "${filename}".`)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setDeletingImportId(null)
    }
  }

  useEffect(() => {
    if (activeBatchId) void loadImports(activeBatchId)
  }, [activeBatchId, loadImports])

  const printBarcodes = async () => {
    if (!activeBatchId) return
    setPrinting(true)
    setMsg(null)
    try {
      const result = await printStockLabels({
        batchId: activeBatchId,
        printerProfileId: workstation.printerProfileId,
        hardware: hw,
      })
      setMsgTone(result.ok ? 'ok' : 'err')
      setMsg(result.message)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      setPrinting(false)
    }
  }

  const deleteTagByBarcode = async (raw?: string) => {
    const code = String(raw ?? tagDeleteCode).trim()
    if (!code || tagDeleteBusy) return
    if (
      !window.confirm(
        `Delete tag "${code}"?\n\nThis permanently removes the piece from stock across all uploads.`,
      )
    ) {
      return
    }
    setTagDeleteBusy(true)
    setMsg(null)
    try {
      await axios.post('/api/reseller/erp/stock-pieces/delete-by-barcode', { barcode: code })
      setMsgTone('ok')
      setMsg(`Tag "${code}" deleted successfully — stock removed from database.`)
      setTagDeleteCode('')
      tagDeleteRef.current?.focus()
      if (activeBatchId) await loadBatch(activeBatchId)
      await loadBatches()
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
      setTagDeleteCode('')
      tagDeleteRef.current?.focus()
    } finally {
      setTagDeleteBusy(false)
    }
  }

  const downloadBatchExcel = () => {
    if (!activeBatch || !pieces.length) {
      setMsgTone('err')
      setMsg('No pieces in this batch to download.')
      return
    }
    const safe = (activeBatch.batch_label || 'stock').replace(/[^\w.-]+/g, '_')
    downloadStockPiecesExcel(pieces, `${safe}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setMsgTone('ok')
    setMsg(`Downloaded ${pieces.length} row(s) as Excel.`)
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
        {/* Batch header */}
        <div className={`${erpCardCls} space-y-3`}>
          <div className="flex flex-wrap items-start gap-3">
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                setActiveBatchId(null)
                setPieces([])
                setImports([])
              }}
            >
              <ArrowLeft className="size-4" />
              All batches
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${erpInputCls} min-w-[120px] max-w-sm text-base font-semibold`}
                  value={renameLabel}
                  onChange={(e) => setRenameLabel(e.target.value)}
                  aria-label="Batch name"
                />
                <button
                  type="button"
                  className={erpBtnGhost}
                  disabled={renaming || !renameLabel.trim() || renameLabel.trim() === activeBatch.batch_label}
                  onClick={() => void renameBatch()}
                >
                  {renaming ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                  Rename
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                {pieces.length} piece(s) in this batch
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
            <label className={`${erpBtnPrimary} cursor-pointer`}>
              <input
                ref={appendFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={appendBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f && activeBatchId) void onFile(f, activeBatchId)
                }}
              />
              {appendBusy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Add Excel
            </label>
            <button type="button" className={erpBtnGhost} disabled={!pieces.length} onClick={downloadBatchExcel}>
              <Download className="size-4" />
              Download Excel
            </button>
            <button type="button" className={erpBtnPrimary} disabled={printing} onClick={() => void printBarcodes()}>
              {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
              Generate barcodes
            </button>
            <button
              type="button"
              className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700"
              disabled={deleting}
              onClick={() => void deleteBatch()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete batch
            </button>
          </div>
        </div>

        {imports.length > 0 || importsLoading ? (
          <details className={`${erpCardCls} group`} open={imports.length <= 3}>
            <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55 marker:content-none">
              <span className="inline-flex items-center gap-1">
                Excel uploads ({imports.length || '…'})
              </span>
            </summary>
            <div className="mt-2 space-y-1.5">
              {importsLoading ? (
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Loading uploads…</p>
              ) : (
                imports.map((imp) => (
                  <div
                    key={imp.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                        {imp.source_filename}
                      </p>
                      <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                        {imp.live_count ?? imp.piece_count} piece(s) · {formatErpDateDdMmYyyy(imp.created_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 disabled:opacity-50"
                      disabled={deletingImportId === imp.id}
                      onClick={() => void deleteImport(imp.id, imp.source_filename)}
                    >
                      {deletingImportId === imp.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </details>
        ) : null}

        {msg ? (
          <p
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              msgTone === 'err'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {msg}
          </p>
        ) : null}
        <ErpStockExcelEditor
          batchId={activeBatchId}
          pieces={pieces}
          onSaved={setPieces}
          scaleProfileId={workstation.scaleProfileId}
          printerProfileId={workstation.printerProfileId}
          rfidEnabled={rfidEnabled}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className={`${erpCardCls} border-rose-100 bg-gradient-to-br from-white to-rose-50/40`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ScanBarcode className="size-4 text-rose-700" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Delete tag by barcode</p>
            <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
              Scan or type a barcode and press Enter — removes the tag from stock across all uploads.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={tagDeleteRef}
            className={erpInputCls}
            placeholder="Scan barcode to delete tag…"
            value={tagDeleteCode}
            disabled={tagDeleteBusy}
            onChange={(e) => setTagDeleteCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void deleteTagByBarcode()
              }
            }}
          />
          <button
            type="button"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
            disabled={tagDeleteBusy || !tagDeleteCode.trim()}
            onClick={() => void deleteTagByBarcode()}
          >
            {tagDeleteBusy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete tag
          </button>
        </div>
        {msg ? (
          <p
            role="status"
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              msgTone === 'err'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {msg}
          </p>
        ) : null}
      </div>
      <ErpStockExcelBuilder
        existingStyles={designStyles}
        existingSkus={designSkus}
        existingProducts={designProducts}
      />
      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <FileSpreadsheet className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Upload stock Excel
        </div>
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
        {msg ? (
          <p className={`mt-2 text-xs font-medium ${msgTone === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>{msg}</p>
        ) : null}
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
