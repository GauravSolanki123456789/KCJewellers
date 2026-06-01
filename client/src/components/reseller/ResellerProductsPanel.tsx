'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import axios from '@/lib/axios'
import {
  emptyProductPayload,
  productImageUrl,
  RESELLER_EXCEL_ACCEPT,
  RESELLER_PRODUCT_IMAGE_ACCEPT,
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  submissionStatusLabel,
  submissionStatusTone,
  type ResellerProductPayload,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import { FileSpreadsheet, ImagePlus, Loader2, Package, Plus, Upload } from 'lucide-react'

type Tab = 'add' | 'list' | 'bulk'

const METAL_OPTIONS = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'gifting', label: 'Gift Items (gifting)' },
]

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Live' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
] as const

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--kc-accent,#c41e3a)] focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/15'

export function ResellerProductsPanel() {
  const [tab, setTab] = useState<Tab>('add')
  const [form, setForm] = useState<ResellerProductPayload>(emptyProductPayload())
  const [primaryFile, setPrimaryFile] = useState<File | null>(null)
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [rows, setRows] = useState<ResellerProductSubmission[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('pending')

  const [bulkParsing, setBulkParsing] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const secondaryInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setListLoading(true)
    try {
      const params = statusFilter ? { submission_status: statusFilter } : {}
      const res = await axios.get<ResellerProductSubmission[]>('/api/reseller/product-submissions', {
        params,
      })
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch {
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    if (tab === 'list') void load()
  }, [tab, load])

  const pendingCount = useMemo(() => rows.filter((r) => r.submission_status === 'pending').length, [rows])

  const setField = <K extends keyof ResellerProductPayload>(key: K, value: ResellerProductPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const validateImage = (file: File | null): string | null => {
    if (!file) return null
    if (file.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
      return `Image too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL})`
    }
    return null
  }

  const submitSingle = async () => {
    setError(null)
    setMessage(null)
    if (!form.styleCode.trim()) return setError('StyleCode is required (e.g. SILVER PLATED)')
    if (!form.sku.trim()) return setError('SKU is required (e.g. GOD FRAMES)')
    if (!form.name.trim()) return setError('Product name is required')
    const bc = (form.barcode || form.name).trim()
    if (!bc) return setError('Barcode is required')
    const pErr = validateImage(primaryFile)
    if (pErr) return setError(pErr)
    const sErr = validateImage(secondaryFile)
    if (sErr) return setError(sErr)

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify({ ...form, barcode: form.barcode || bc }))
      if (primaryFile) fd.append('primaryImage', primaryFile, `${bc}.webp`)
      if (secondaryFile) fd.append('secondaryImage', secondaryFile, `${bc}_secondary.webp`)
      await axios.post('/api/reseller/product-submissions', fd)
      setMessage('Submitted for KC admin review. It will appear on the public site after approval.')
      setForm(emptyProductPayload())
      setPrimaryFile(null)
      setSecondaryFile(null)
      if (primaryInputRef.current) primaryInputRef.current.value = ''
      if (secondaryInputRef.current) secondaryInputRef.current.value = ''
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  const parseExcelFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return []
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      return lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
        const row: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          row[h] = cells[i] ?? ''
        })
        return row
      })
    }
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  }

  const handleBulkExcel = async (file: File) => {
    setBulkParsing(true)
    setBulkResult(null)
    setError(null)
    try {
      const products = await parseExcelFile(file)
      if (!products.length) {
        setError('No rows found in spreadsheet')
        return
      }
      const res = await axios.post<{
        created_count: number
        errors?: { row: number; error: string }[]
      }>('/api/reseller/product-submissions/bulk', { products })
      const n = res.data.created_count ?? 0
      const errN = res.data.errors?.length ?? 0
      setBulkResult(
        `Queued ${n} product${n === 1 ? '' : 's'} for admin review${errN ? ` (${errN} row${errN === 1 ? '' : 's'} skipped)` : ''}.`,
      )
      if (tab === 'list') void load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Bulk import failed')
    } finally {
      setBulkParsing(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  const withdraw = async (id: number) => {
    if (!window.confirm('Withdraw this pending submission?')) return
    try {
      await axios.delete(`/api/reseller/product-submissions/${id}`)
      await load()
    } catch {
      alert('Could not withdraw')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 scrollbar-none">
        {(
          [
            { id: 'add' as Tab, label: 'Add product', icon: Plus },
            { id: 'list' as Tab, label: `My uploads${pendingCount ? ` (${pendingCount})` : ''}`, icon: Package },
            { id: 'bulk' as Tab, label: 'Bulk Excel', icon: FileSpreadsheet },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              tab === id
                ? 'bg-white text-[var(--kc-accent,#c41e3a)] shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {message ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {tab === 'add' ? (
        <div className="space-y-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add a product</h2>
            <p className="mt-1 text-sm text-slate-500">
              Same fields as ERP sync. Upload front and back photos from your phone. KC admin approves before it goes
              live on kcjewellers.co.in.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="StyleCode" hint="e.g. SILVER PLATED">
              <input
                className={inputCls}
                value={form.styleCode}
                onChange={(e) => setField('styleCode', e.target.value.toUpperCase())}
                placeholder="SILVER PLATED"
              />
            </Field>
            <Field label="SKU" hint="Sub-category e.g. GOD FRAMES">
              <input
                className={inputCls}
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value.toUpperCase())}
                placeholder="GOD FRAMES"
              />
            </Field>
            <Field label="Barcode" hint="Unique product code">
              <input
                className={inputCls}
                value={form.barcode || ''}
                onChange={(e) => setField('barcode', e.target.value)}
                placeholder="RAM-PARIVAR-001"
              />
            </Field>
            <Field label="ProductName">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="RAM PARIVAR"
              />
            </Field>
            <Field label="MetalType">
              <select
                className={inputCls}
                value={form.metalType}
                onChange={(e) => setField('metalType', e.target.value)}
              >
                {METAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="FixedPrice (₹)" hint="Gift items — fixed price">
              <input
                className={inputCls}
                type="number"
                min={0}
                value={form.fixedPrice ?? ''}
                onChange={(e) => setField('fixedPrice', e.target.value)}
                placeholder="999"
              />
            </Field>
            <Field label="ItemCode" hint="Design group">
              <input
                className={inputCls}
                value={form.itemCode || ''}
                onChange={(e) => setField('itemCode', e.target.value)}
              />
            </Field>
            <Field label="Size">
              <input className={inputCls} value={form.size || ''} onChange={(e) => setField('size', e.target.value)} />
            </Field>
            <Field label="AvgWeight (g)">
              <input
                className={inputCls}
                type="number"
                step="0.001"
                value={form.netWeight ?? ''}
                onChange={(e) => setField('netWeight', e.target.value)}
              />
            </Field>
            <Field label="Purity">
              <input
                className={inputCls}
                value={form.purity || ''}
                onChange={(e) => setField('purity', e.target.value)}
              />
            </Field>
            <Field label="MCRate">
              <input
                className={inputCls}
                type="number"
                value={form.mcRate ?? ''}
                onChange={(e) => setField('mcRate', e.target.value)}
              />
            </Field>
            <Field label="StoneCharges">
              <input
                className={inputCls}
                type="number"
                value={form.stoneCharges ?? ''}
                onChange={(e) => setField('stoneCharges', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ImageUploadTile
              label="Front photo"
              hint={`PNG/JPEG/WebP · max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL}`}
              file={primaryFile}
              inputRef={primaryInputRef}
              onPick={setPrimaryFile}
            />
            <ImageUploadTile
              label="Back photo (optional)"
              hint="Saved as barcode_secondary.webp"
              file={secondaryFile}
              inputRef={secondaryInputRef}
              onPick={setSecondaryFile}
            />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitSingle()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            Submit for admin review
          </button>
        </div>
      ) : null}

      {tab === 'list' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key || 'all'}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === key
                    ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {listLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-slate-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
              No submissions yet. Add a product or import Excel.
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <SubmissionCard key={row.id} row={row} onWithdraw={withdraw} />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'bulk' ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">Bulk import (Excel)</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Use Sample_Products.xlsx columns: Barcode, SKU, StyleCode, ProductName, MetalType (gifting for gift items),
            FixedPrice, ItemCode, etc. Rows queue for admin approval.
          </p>
          <input
            ref={excelInputRef}
            type="file"
            accept={RESELLER_EXCEL_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleBulkExcel(f)
            }}
          />
          <button
            type="button"
            disabled={bulkParsing}
            onClick={() => excelInputRef.current?.click()}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700 transition hover:border-[var(--kc-accent,#c41e3a)]/40 hover:bg-white disabled:opacity-60"
          >
            {bulkParsing ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FileSpreadsheet className="size-5 text-emerald-600" />
            )}
            Choose .xlsx or .csv file
          </button>
          {bulkResult ? (
            <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{bulkResult}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ImageUploadTile({
  label,
  hint,
  file,
  inputRef,
  onPick,
}: {
  label: string
  hint: string
  file: File | null
  inputRef: RefObject<HTMLInputElement | null>
  onPick: (f: File | null) => void
}) {
  const preview = file ? URL.createObjectURL(file) : null
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white transition hover:border-[var(--kc-accent,#c41e3a)]/30"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-24 max-w-full rounded object-contain" />
        ) : (
          <>
            <ImagePlus className="size-8 text-slate-300" />
            <span className="text-xs text-slate-500">Tap to choose</span>
          </>
        )}
      </button>
      {file ? (
        <button
          type="button"
          className="mt-2 text-xs text-rose-600"
          onClick={() => {
            onPick(null)
            if (inputRef.current) inputRef.current.value = ''
          }}
        >
          Remove
        </button>
      ) : null}
    </div>
  )
}

function SubmissionCard({
  row,
  onWithdraw,
}: {
  row: ResellerProductSubmission
  onWithdraw: (id: number) => void
}) {
  const sku = row.barcode || row.web_product_sku || row.sku || ''
  const img = row.image_url || (sku ? productImageUrl(sku) : '')
  const status = row.submission_status as ResellerSubmissionStatus

  return (
    <li className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:size-24">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-300">
            <Package className="size-8" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{row.product_name || sku}</p>
            <p className="text-xs text-slate-500">
              {row.style_code} › {row.sku}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${submissionStatusTone(status)}`}
          >
            {submissionStatusLabel(status)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{formatWhen(row.created_at)}</p>
        {row.review_notes ? <p className="mt-2 text-xs text-rose-600">{row.review_notes}</p> : null}
        {status === 'pending' ? (
          <button
            type="button"
            onClick={() => onWithdraw(row.id)}
            className="mt-2 text-xs font-medium text-slate-500 underline-offset-2 hover:text-rose-600 hover:underline"
          >
            Withdraw
          </button>
        ) : null}
      </div>
    </li>
  )
}
