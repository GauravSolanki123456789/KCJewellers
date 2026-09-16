'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Plus, Printer, Trash2 } from 'lucide-react'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls, erpErr } from '@/components/reseller/erp/erp-ui'
import { printStockLabels } from '@/lib/erp-print-labels'
import type { ErpHardwareSettings } from '@/lib/erp-hardware'

type DesignStyle = {
  style_code: string
  skus: { sku: string; product_name?: string | null }[]
}

type BatchOption = { id: string; batch_label: string }

type ManualRow = {
  id: string
  style_code: string
  sku: string
  product_name: string
  avg_weight: string
  purity: string
  pcs: string
  rfid_tag: string
}

type DesignDefaults = {
  product_name?: string | null
  purity?: number | null
  mc_rate?: number | null
  mc_rate_slab_r?: number | null
  mc_rate_slab_w?: number | null
  mc_rate_slab_f?: number | null
  metal_slab_r_pct?: number | null
  metal_slab_w_pct?: number | null
  metal_slab_f_pct?: number | null
  mc_type?: string | null
}

function newRow(): ManualRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    style_code: '',
    sku: '',
    product_name: '',
    avg_weight: '',
    purity: '',
    pcs: '1',
    rfid_tag: '',
  }
}

function normCode(v: string): string {
  return v.trim().toUpperCase()
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

export function ErpManualAddProduct({
  batches,
  designTree,
  printerProfileId,
  hardware,
  rfidEnabled,
  defaultBatchId,
  onAdded,
  onDesignTreeRefresh,
}: {
  batches: BatchOption[]
  designTree: DesignStyle[]
  printerProfileId?: string | null
  hardware?: ErpHardwareSettings | null
  rfidEnabled?: boolean
  defaultBatchId?: string | null
  onAdded?: (batchId: string) => void
  onDesignTreeRefresh?: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [batchId, setBatchId] = useState('')
  const [batchQuery, setBatchQuery] = useState('')
  const [rows, setRows] = useState<ManualRow[]>([newRow()])
  const [defaults, setDefaults] = useState<Record<string, DesignDefaults | null>>({})
  const [productOptions, setProductOptions] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok')
  const skuRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const wtRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const styleOptions = useMemo(
    () => designTree.map((s) => s.style_code).filter(Boolean),
    [designTree],
  )

  const batchOptions = useMemo(
    () => batches.map((b) => b.batch_label),
    [batches],
  )

  const skusForStyle = useCallback(
    (styleCode: string) => {
      const style = designTree.find(
        (s) => normCode(s.style_code) === normCode(styleCode),
      )
      return (style?.skus || []).map((sk) => sk.sku).filter(Boolean)
    },
    [designTree],
  )

  const ensureStyle = useCallback(
    async (styleCode: string) => {
      const code = normCode(styleCode)
      if (!code) return
      const exists = designTree.some((s) => normCode(s.style_code) === code)
      if (exists) return
      await axios.post('/api/reseller/erp/design-master/styles', {
        style_code: code,
        style_name: code,
      })
      await onDesignTreeRefresh?.()
    },
    [designTree, onDesignTreeRefresh],
  )

  const ensureSku = useCallback(
    async (styleCode: string, sku: string, productName?: string) => {
      const style = normCode(styleCode)
      const skuCode = normCode(sku)
      if (!style || !skuCode) return
      await ensureStyle(style)
      const styleRow = designTree.find((s) => normCode(s.style_code) === style)
      const exists = styleRow?.skus.some((sk) => normCode(sk.sku) === skuCode)
      if (exists) return
      await axios.post('/api/reseller/erp/design-master/skus', {
        style_code: style,
        sku: skuCode,
        product_name: productName?.trim() || undefined,
      })
      await onDesignTreeRefresh?.()
    },
    [designTree, ensureStyle, onDesignTreeRefresh],
  )

  const loadDefaults = useCallback(async (rowId: string, styleCode: string, sku: string) => {
    if (!styleCode.trim() || !sku.trim()) {
      setDefaults((d) => ({ ...d, [rowId]: null }))
      return
    }
    try {
      const res = await axios.get<{ defaults: DesignDefaults | null }>(
        '/api/reseller/erp/design-master/lookup',
        { params: { style_code: styleCode.trim(), sku: sku.trim() } },
      )
      const def = res.data.defaults || null
      setDefaults((d) => ({ ...d, [rowId]: def }))
      if (def) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  purity: r.purity || (def.purity != null ? String(def.purity) : r.purity),
                  product_name:
                    r.product_name || (def.product_name ? String(def.product_name) : r.product_name),
                }
              : r,
          ),
        )
      }
      const productsRes = await axios.get<{ products: { product_name: string }[] }>(
        '/api/reseller/erp/design-master/catalog-products',
        { params: { style_code: styleCode.trim(), sku: sku.trim() } },
      )
      const names = (productsRes.data.products || [])
        .map((p) => p.product_name)
        .filter(Boolean)
      setProductOptions((p) => ({ ...p, [rowId]: names }))
    } catch {
      setDefaults((d) => ({ ...d, [rowId]: null }))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (defaultBatchId) {
      const b = batches.find((x) => x.id === defaultBatchId)
      if (b) {
        setBatchId(b.id)
        setBatchQuery(b.batch_label)
      }
      return
    }
    if (!batchId && batches.length === 1) {
      setBatchId(batches[0].id)
      setBatchQuery(batches[0].batch_label)
    }
  }, [open, batchId, batches, defaultBatchId])

  const updateRow = (rowId: string, patch: Partial<ManualRow>) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  const commitStyle = async (row: ManualRow, styleCode: string) => {
    const code = normCode(styleCode)
    if (!code) return
    try {
      await ensureStyle(code)
      updateRow(row.id, { style_code: code, sku: '', product_name: '' })
      setDefaults((d) => ({ ...d, [row.id]: null }))
      setTimeout(() => skuRefs.current[row.id]?.focus(), 0)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    }
  }

  const commitSku = async (row: ManualRow, sku: string) => {
    const skuCode = normCode(sku)
    const styleCode = normCode(row.style_code)
    if (!skuCode || !styleCode) return
    try {
      await ensureSku(styleCode, skuCode, row.product_name)
      const style = designTree.find((s) => normCode(s.style_code) === styleCode)
      const match = style?.skus.find((sk) => normCode(sk.sku) === skuCode)
      updateRow(row.id, {
        sku: skuCode,
        product_name: match?.product_name || row.product_name,
      })
      await loadDefaults(row.id, styleCode, skuCode)
      setTimeout(() => wtRefs.current[row.id]?.focus(), 0)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    }
  }

  const commitBatch = (label: string) => {
    const v = label.trim()
    setBatchQuery(v)
    const exact = batches.find((b) => b.batch_label.toLowerCase() === v.toLowerCase())
    if (exact) {
      setBatchId(exact.id)
      return
    }
    const partial = batches.find((b) => b.batch_label.toLowerCase().includes(v.toLowerCase()))
    if (partial && v) setBatchId(partial.id)
  }

  const submit = async () => {
    if (!batchId) {
      setMsgTone('err')
      setMsg('Choose a stock batch first.')
      return
    }
    const validRows = rows.filter(
      (r) => r.style_code.trim() && r.sku.trim() && r.avg_weight.trim(),
    )
    if (!validRows.length) {
      setMsgTone('err')
      setMsg('Add at least one row with style, SKU, and weight.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      for (const r of validRows) {
        await ensureStyle(r.style_code)
        await ensureSku(r.style_code, r.sku, r.product_name)
      }
      const excelRows = validRows.map((r) => {
        const def = defaults[r.id]
        const productName = r.product_name.trim() || def?.product_name || ''
        return {
          StyleCode: r.style_code.trim(),
          SKU: r.sku.trim(),
          ProductName: productName,
          ItemCode: productName || r.sku.trim(),
          AvgWeight: r.avg_weight.trim(),
          Purity: r.purity.trim() || (def?.purity != null ? String(def.purity) : ''),
          PCS: r.pcs.trim() || '1',
          RFIDTag: rfidEnabled ? r.rfid_tag.trim() : '',
        }
      })
      const res = await axios.post<{
        batch_id: string
        inserted: number
        inserted_pieces?: { id: number; barcode: string }[]
        duplicate_skipped?: number
      }>('/api/reseller/erp/stock-pieces/bulk', {
        batch_id: batchId,
        source_filename: 'Manual add',
        rows: excelRows,
      })
      const pieceIds = (res.data.inserted_pieces || []).map((p) => p.id)
      const barcodes = (res.data.inserted_pieces || []).map((p) => p.barcode).join(', ')
      let printMsg = ''
      if (pieceIds.length) {
        const printRes = await printStockLabels({
          pieceIds,
          printerProfileId,
          hardware,
        })
        printMsg = printRes.ok ? ` · ${printRes.message}` : ` · Print: ${printRes.message}`
      }
      setMsgTone('ok')
      const batchName = batches.find((b) => b.id === batchId)?.batch_label || 'stock'
      setMsg(
        `Added ${res.data.inserted} piece(s) to ${batchName}${barcodes ? ` · ${barcodes}` : ''}${res.data.duplicate_skipped ? ` · ${res.data.duplicate_skipped} skipped` : ''}${printMsg}`,
      )
      setRows([newRow()])
      onAdded?.(res.data.batch_id)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className={erpCardCls}>
        <button
          type="button"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#faf8f4)]"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4 text-emerald-700" />
          Add product(s)
        </button>
      </div>
    )
  }

  return (
    <div className={`${erpCardCls} space-y-4 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/30`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add product(s)</p>
        <button type="button" className={erpBtnGhost} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <FieldLabel label="Stock batch">
        <ErpBillingSuggestField
          value={batchQuery}
          placeholder="VALAK, KAMACHI, CHOMBU…"
          options={batchOptions}
          onChange={setBatchQuery}
          onCommit={commitBatch}
        />
      </FieldLabel>

      <div className="space-y-3">
        {rows.map((row, idx) => {
          const def = defaults[row.id]
          const skuOpts = skusForStyle(row.style_code)
          const prodOpts = productOptions[row.id] || []
          return (
            <div
              key={row.id}
              className="space-y-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--color-jewelry-black,#1a1814)]">#{idx + 1}</p>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50"
                    onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Style">
                  <ErpBillingSuggestField
                    value={row.style_code}
                    placeholder="KUTHU VALAK"
                    options={styleOptions}
                    autoFocus={idx === 0}
                    onChange={(v) => updateRow(row.id, { style_code: v })}
                    onCommit={(v) => void commitStyle(row, v)}
                  />
                </FieldLabel>
                <FieldLabel label="SKU">
                  <ErpBillingSuggestField
                    value={row.sku}
                    placeholder={row.style_code ? 'BLR CV CASTING-VLK' : 'Select style first'}
                    options={row.style_code ? skuOpts : []}
                    emptyText={row.style_code ? 'Type new SKU + Enter to create' : 'Select style first'}
                    inputRef={(el) => {
                      skuRefs.current[row.id] = el
                    }}
                    onChange={(v) => updateRow(row.id, { sku: v })}
                    onCommit={(v) => void commitSku(row, v)}
                  />
                </FieldLabel>
                <FieldLabel label="Product name">
                  <ErpBillingSuggestField
                    value={row.product_name}
                    placeholder="VLK"
                    options={prodOpts}
                    onChange={(v) => updateRow(row.id, { product_name: v })}
                    onCommit={(v) => updateRow(row.id, { product_name: v.trim().toUpperCase() })}
                  />
                </FieldLabel>
                <FieldLabel label="Weight (g)">
                  <input
                    ref={(el) => {
                      wtRefs.current[row.id] = el
                    }}
                    className={`${erpInputCls} text-xs`}
                    inputMode="decimal"
                    placeholder="150.4"
                    value={row.avg_weight}
                    onChange={(e) => updateRow(row.id, { avg_weight: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        document.getElementById(`manual-purity-${row.id}`)?.focus()
                      }
                    }}
                  />
                </FieldLabel>
                <FieldLabel label="Purity">
                  <input
                    id={`manual-purity-${row.id}`}
                    className={`${erpInputCls} text-xs`}
                    inputMode="numeric"
                    placeholder={def?.purity != null ? String(def.purity) : '80'}
                    value={row.purity}
                    onChange={(e) => updateRow(row.id, { purity: e.target.value })}
                  />
                </FieldLabel>
                <FieldLabel label="PCS">
                  <input
                    className={`${erpInputCls} text-xs`}
                    inputMode="numeric"
                    value={row.pcs}
                    onChange={(e) => updateRow(row.id, { pcs: e.target.value })}
                  />
                </FieldLabel>
                {rfidEnabled ? (
                  <FieldLabel label="RFID tag (optional)">
                    <input
                      className={`${erpInputCls} font-mono text-xs`}
                      placeholder="B1238"
                      value={row.rfid_tag}
                      onChange={(e) => updateRow(row.id, { rfid_tag: e.target.value.toUpperCase() })}
                    />
                  </FieldLabel>
                ) : null}
              </div>
              {def ? (
                <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/55">
                  MC {def.mc_rate ?? '—'} · MC R {def.mc_rate_slab_r ?? '—'} · MC W {def.mc_rate_slab_w ?? '—'} ·
                  MC F {def.mc_rate_slab_f ?? '—'} · Met R% {def.metal_slab_r_pct ?? '—'} · Met W%{' '}
                  {def.metal_slab_w_pct ?? '—'} · {def.mc_type || 'MCType —'}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {rows.length < 5 ? (
        <button
          type="button"
          className={`${erpBtnGhost} w-full justify-center`}
          onClick={() => setRows((r) => [...r, newRow()])}
        >
          <Plus className="size-4" />
          Add another row ({rows.length}/5)
        </button>
      ) : null}

      <button
        type="button"
        className={`${erpBtnPrimary} w-full justify-center`}
        disabled={busy || !batchId}
        onClick={() => void submit()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
        Save, print barcode & add to stock
      </button>

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
    </div>
  )
}
