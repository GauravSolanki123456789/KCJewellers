'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Plus, Printer, Trash2 } from 'lucide-react'
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

function rankOptions(options: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return [...options].sort((a, b) => {
    const al = a.toLowerCase()
    const bl = b.toLowerCase()
    const aStarts = al.startsWith(q)
    const bStarts = bl.startsWith(q)
    if (aStarts && !bStarts) return -1
    if (!aStarts && bStarts) return 1
    const aIncludes = al.includes(q)
    const bIncludes = bl.includes(q)
    if (aIncludes && !bIncludes) return -1
    if (!aIncludes && bIncludes) return 1
    return al.localeCompare(bl)
  })
}

function SmartField({
  label,
  value,
  onChange,
  options,
  placeholder,
  listId,
  inputId,
  inputMode,
  onEnter,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  listId: string
  inputId?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  onEnter?: () => void
  autoFocus?: boolean
}) {
  const ranked = useMemo(() => rankOptions(options, value).slice(0, 80), [options, value])
  return (
    <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
      {label}
      <input
        id={inputId}
        className={`${erpInputCls} mt-1 text-xs`}
        list={listId}
        placeholder={placeholder}
        value={value}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter?.()
          }
        }}
      />
      <datalist id={listId}>
        {ranked.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
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
}: {
  batches: BatchOption[]
  designTree: DesignStyle[]
  printerProfileId?: string | null
  hardware?: ErpHardwareSettings | null
  rfidEnabled?: boolean
  defaultBatchId?: string | null
  onAdded?: (batchId: string) => void
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
        (s) => s.style_code.toLowerCase() === styleCode.trim().toLowerCase(),
      )
      return (style?.skus || []).map((sk) => sk.sku).filter(Boolean)
    },
    [designTree],
  )

  const loadDefaults = useCallback(async (rowId: string, styleCode: string, sku: string) => {
    const key = `${styleCode}|${sku}`
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
                  product_name: r.product_name || (def.product_name ? String(def.product_name) : r.product_name),
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

  const onStyleChange = (row: ManualRow, styleCode: string) => {
    updateRow(row.id, { style_code: styleCode.toUpperCase(), sku: '', product_name: '' })
    setDefaults((d) => ({ ...d, [row.id]: null }))
  }

  const onSkuChange = (row: ManualRow, sku: string) => {
    const style = designTree.find(
      (s) => s.style_code.toLowerCase() === row.style_code.trim().toLowerCase(),
    )
    const match = style?.skus.find((sk) => sk.sku.toLowerCase() === sku.trim().toLowerCase())
    updateRow(row.id, {
      sku: sku.toUpperCase(),
      product_name: match?.product_name || row.product_name,
    })
    void loadDefaults(row.id, row.style_code, sku)
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

      <SmartField
        label="Stock batch"
        value={batchQuery}
        onChange={(v) => {
          setBatchQuery(v)
          const exact = batches.find((b) => b.batch_label.toLowerCase() === v.trim().toLowerCase())
          if (exact) {
            setBatchId(exact.id)
            return
          }
          const ranked = rankOptions(batchOptions, v)
          const partial = batches.find((b) => b.batch_label.toLowerCase() === ranked[0]?.toLowerCase())
          if (partial && v.trim()) setBatchId(partial.id)
        }}
        options={batchOptions}
        listId="manual-add-batch-list"
        placeholder="VALAK, KAMACHI, CHOMBU…"
      />

      <div className="space-y-3">
        {rows.map((row, idx) => {
          const def = defaults[row.id]
          const skuOpts = skusForStyle(row.style_code)
          const prodOpts = productOptions[row.id] || []
          return (
            <div
              key={row.id}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 space-y-3"
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
                <SmartField
                  label="Style"
                  value={row.style_code}
                  onChange={(v) => onStyleChange(row, v)}
                  options={styleOptions}
                  listId={`manual-style-${row.id}`}
                  placeholder="KUTHU VALAK"
                  autoFocus={idx === 0}
                  onEnter={() => document.getElementById(`manual-sku-${row.id}`)?.focus()}
                />
                <SmartField
                  label="SKU"
                  value={row.sku}
                  onChange={(v) => onSkuChange(row, v)}
                  options={skuOpts}
                  listId={`manual-sku-${row.id}`}
                  inputId={`manual-sku-${row.id}`}
                  placeholder="BLR CV CASTING-VLK"
                  onEnter={() => document.getElementById(`manual-wt-${row.id}`)?.focus()}
                />
                <SmartField
                  label="Product name"
                  value={row.product_name}
                  onChange={(v) => updateRow(row.id, { product_name: v })}
                  options={prodOpts}
                  listId={`manual-prod-${row.id}`}
                  placeholder="VLK"
                />
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  Weight (g)
                  <input
                    id={`manual-wt-${row.id}`}
                    className={`${erpInputCls} mt-1 text-xs`}
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
                </label>
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  Purity
                  <input
                    id={`manual-purity-${row.id}`}
                    className={`${erpInputCls} mt-1 text-xs`}
                    inputMode="numeric"
                    placeholder={def?.purity != null ? String(def.purity) : '80'}
                    value={row.purity}
                    onChange={(e) => updateRow(row.id, { purity: e.target.value })}
                  />
                </label>
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  PCS
                  <input
                    className={`${erpInputCls} mt-1 text-xs`}
                    inputMode="numeric"
                    value={row.pcs}
                    onChange={(e) => updateRow(row.id, { pcs: e.target.value })}
                  />
                </label>
                {rfidEnabled ? (
                  <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
                    RFID tag (optional)
                    <input
                      className={`${erpInputCls} mt-1 font-mono text-xs`}
                      placeholder="B1238"
                      value={row.rfid_tag}
                      onChange={(e) => updateRow(row.id, { rfid_tag: e.target.value.toUpperCase() })}
                    />
                  </label>
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
