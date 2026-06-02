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
  type ResellerProductBatch,
  type ResellerProductPayload,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import { FileSpreadsheet, ImagePlus, Loader2, Package, Plus, Send, Upload } from 'lucide-react'

type Tab = 'add' | 'batches' | 'list'

const METAL_OPTIONS = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'gifting', label: 'Gift Items (gifting)' },
]

const STATUS_FILTERS = [
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'In review' },
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
      <span className="kc-upload-label text-xs font-medium">{label}</span>
      {hint ? <span className="kc-upload-hint mt-0.5 block text-[11px]">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

const inputCls =
  'kc-upload-input w-full rounded-xl px-3 py-2.5 text-sm shadow-sm outline-none transition'

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
  const [batches, setBatches] = useState<ResellerProductBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null)
  const [batchProducts, setBatchProducts] = useState<ResellerProductSubmission[]>([])
  const [batchProductsLoading, setBatchProductsLoading] = useState(false)
  const [submittingBatchId, setSubmittingBatchId] = useState<string | null>(null)
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
  const draftBatchCount = useMemo(
    () => batches.filter((b) => (b.draft_count ?? 0) > 0).length,
    [batches],
  )

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true)
    try {
      const res = await axios.get<ResellerProductBatch[]>('/api/reseller/product-batches')
      setBatches(Array.isArray(res.data) ? res.data : [])
    } catch {
      setBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }, [])

  const loadBatchProducts = useCallback(async (batchId: string) => {
    setBatchProductsLoading(true)
    try {
      const res = await axios.get<ResellerProductSubmission[]>('/api/reseller/product-submissions', {
        params: { batch_id: batchId, submission_status: 'draft' },
      })
      setBatchProducts(Array.isArray(res.data) ? res.data : [])
    } catch {
      setBatchProducts([])
    } finally {
      setBatchProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  useEffect(() => {
    if (expandedBatchId) void loadBatchProducts(expandedBatchId)
  }, [expandedBatchId, loadBatchProducts])

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

  const rowHasData = (row: Record<string, unknown>) =>
    Object.values(row).some((v) => String(v ?? '').trim() !== '')

  const parseExcelFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return []
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
      return lines
        .slice(1)
        .map((line) => {
          const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
          const row: Record<string, unknown> = {}
          headers.forEach((h, i) => {
            row[h] = cells[i] ?? ''
          })
          return row
        })
        .filter(rowHasData)
    }
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    return rows.filter(rowHasData)
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
        batch_id?: string
        errors?: { row: number; error: string }[]
      }>('/api/reseller/product-submissions/bulk', { products })
      const n = res.data.created_count ?? 0
      const errs = res.data.errors ?? []
      const errN = errs.length
      if (n === 0) {
        const first = errs[0]?.error
        const rowHint = errs[0]?.row != null ? ` (row ${errs[0].row + 1})` : ''
        setError(
          first
            ? `No rows imported${rowHint}: ${first}${errN > 1 ? ` — and ${errN - 1} more` : ''}`
            : 'No rows imported. Check Barcode, StyleCode, and MetalType (use gifting for gift items).',
        )
        return
      }
      setBulkResult(
        `${n} product${n === 1 ? '' : 's'} imported — add photos, then send the batch for KC review.${errN ? ` (${errN} row${errN === 1 ? '' : 's'} skipped)` : ''}`,
      )
      if (res.data.batch_id) {
        setExpandedBatchId(res.data.batch_id)
        setTab('batches')
      }
      void loadBatches()
    } catch (e: unknown) {
      const data =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string; errors?: { row: number; error: string }[] } } })
              .response?.data
          : null
      const firstRow = data?.errors?.[0]
      const msg =
        data?.error ||
        (firstRow
          ? `Row ${firstRow.row + 1}: ${firstRow.error}`
          : null)
      setError(msg || 'Bulk import failed')
    } finally {
      setBulkParsing(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  const submitBatchForReview = async (batchId: string) => {
    if (!window.confirm('Send this entire batch to KC admin for review?')) return
    setSubmittingBatchId(batchId)
    try {
      await axios.post(`/api/reseller/product-batches/${batchId}/submit-for-review`)
      setMessage('Batch sent for KC review. You can start another Excel import anytime.')
      setExpandedBatchId(null)
      await loadBatches()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not submit batch')
    } finally {
      setSubmittingBatchId(null)
    }
  }

  const uploadPhotos = async (submissionId: number, primary: File | null, secondary: File | null) => {
    const fd = new FormData()
    fd.append('payload', JSON.stringify({}))
    if (primary) fd.append('primaryImage', primary)
    if (secondary) fd.append('secondaryImage', secondary)
    await axios.put(`/api/reseller/product-submissions/${submissionId}`, fd)
    if (expandedBatchId) await loadBatchProducts(expandedBatchId)
    await loadBatches()
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
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white/80 p-1 scrollbar-none">
        {(
          [
            { id: 'add' as Tab, label: 'Add product', icon: Plus },
            {
              id: 'batches' as Tab,
              label: `Excel batches${draftBatchCount ? ` (${draftBatchCount})` : ''}`,
              icon: FileSpreadsheet,
            },
            { id: 'list' as Tab, label: `My uploads${pendingCount ? ` (${pendingCount})` : ''}`, icon: Package },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              tab === id
                ? 'bg-white text-[var(--kc-accent,#c41e3a)] shadow-sm ring-1 ring-[var(--color-slate-700,#e8e4df)]'
                : 'text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-white/80'
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
        <div className="kc-upload-card space-y-5 rounded-2xl p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">Add one product</h2>

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
            <Field label="Size (inches)" hint="e.g. 2.5x5.5">
              <input
                className={inputCls}
                value={form.size || ''}
                onChange={(e) => setField('size', e.target.value)}
                placeholder="2.5x5.5"
              />
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
                    : 'bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]/70 ring-1 ring-[var(--color-slate-700,#e8e4df)] hover:bg-white'
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
            <div className="kc-upload-card rounded-2xl border-dashed px-6 py-12 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
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

      {tab === 'batches' ? (
        <div className="space-y-4">
          <div className="kc-upload-card rounded-2xl p-4 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">Bulk Excel import</h2>
            <p className="kc-upload-hint mt-2 text-sm leading-relaxed">
              Barcode, SKU, StyleCode, ProductName, <strong>Size</strong> (e.g. 3x2.5), MetalType
              (gifting), <strong>FixedPrice</strong>, <strong>ItemCode</strong> (design group — e.g.
              Ganesh). One row per size; same ItemCode + different Size = one product with size options
              on the shop. Upload one photo named <span className="font-mono text-xs">ItemCode.webp</span>{' '}
              (e.g. ganesh.webp). Import first — add photos — then send for KC review.
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
              className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-slate-700,#d6d3d1)] bg-[var(--color-slate-900,#f7f4ef)] px-4 py-4 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)]/40 hover:bg-white disabled:opacity-60"
            >
              {bulkParsing ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-5 text-emerald-600" />
              )}
              Choose .xlsx or .csv file
            </button>
            {bulkResult ? (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {bulkResult}
              </p>
            ) : null}
          </div>

          {batchesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
            </div>
          ) : batches.length === 0 ? (
            <div className="kc-upload-card rounded-2xl border-dashed px-6 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
              No Excel batches yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {batches.map((b) => {
                const open = expandedBatchId === b.batch_id
                const canSubmit = (b.draft_count ?? 0) > 0
                return (
                  <li key={b.batch_id} className="kc-upload-card overflow-hidden rounded-2xl shadow-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedBatchId(open ? null : b.batch_id)}
                      className="flex w-full items-start justify-between gap-3 p-4 text-left sm:p-5"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {b.batch_label || 'Excel import'}
                        </p>
                        <p className="kc-upload-hint mt-1 text-xs">
                          {b.product_count} items · {b.with_primary_image}/{b.product_count} with front photo
                          {b.draft_count ? ` · ${b.draft_count} draft` : ''}
                          {b.pending_count ? ` · ${b.pending_count} in review` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-[var(--kc-accent,#c41e3a)]">
                        {open ? 'Hide' : 'Open'}
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t border-[var(--color-slate-700,#e8e4df)] px-4 pb-4 sm:px-5 sm:pb-5">
                        {canSubmit ? (
                          <button
                            type="button"
                            disabled={submittingBatchId === b.batch_id}
                            onClick={() => void submitBatchForReview(b.batch_id)}
                            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {submittingBatchId === b.batch_id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            Send batch to KC for review
                          </button>
                        ) : (
                          <p className="kc-upload-hint mt-4 text-xs">
                            {b.pending_count ? 'This batch is with KC admin for review.' : 'All items processed.'}
                          </p>
                        )}
                        {batchProductsLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="size-6 animate-spin" />
                          </div>
                        ) : (
                          <ul className="mt-4 space-y-3">
                            {batchProducts.map((p) => (
                              <BatchProductPhotoRow key={p.id} row={p} onSave={uploadPhotos} />
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
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
    <div className="kc-upload-photo-tile rounded-xl border border-dashed border-[var(--color-slate-700,#d6d3d1)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
      <p className="kc-upload-label text-xs font-medium">{label}</p>
      <p className="kc-upload-hint text-[11px]">{hint}</p>
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
        className="mt-3 flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white transition hover:border-[var(--kc-accent,#c41e3a)]/40"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-24 max-w-full rounded object-contain" />
        ) : (
          <>
            <ImagePlus className="size-8 text-[var(--color-jewelry-black,#1a1814)]/25" />
            <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">Tap to choose</span>
          </>
        )}
      </button>
      {file ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-rose-600"
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

function BatchProductPhotoRow({
  row,
  onSave,
}: {
  row: ResellerProductSubmission
  onSave: (id: number, primary: File | null, secondary: File | null) => Promise<void>
}) {
  const [primary, setPrimary] = useState<File | null>(null)
  const [secondary, setSecondary] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const primaryRef = useRef<HTMLInputElement>(null)
  const secondaryRef = useRef<HTMLInputElement>(null)
  const sku = row.barcode || row.web_product_sku || row.sku || ''
  const existingPrimary = row.image_url || (sku ? productImageUrl(sku) : '')
  const existingSecondary = row.secondary_image_url || ''

  const save = async () => {
    if (!primary && !secondary) return
    setSaving(true)
    try {
      await onSave(row.id, primary, secondary)
      setPrimary(null)
      setSecondary(null)
      if (primaryRef.current) primaryRef.current.value = ''
      if (secondaryRef.current) secondaryRef.current.value = ''
    } catch {
      alert('Could not save photos')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--color-jewelry-black,#1a1814)]">
            {row.product_name || sku}
          </p>
          <p className="kc-upload-hint text-xs">
            {row.style_code} › {row.sku}
            {row.fixed_price != null && Number(row.fixed_price) > 0 ? ` · ₹${row.fixed_price}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <div className="size-14 overflow-hidden rounded-lg bg-[var(--color-slate-900,#f7f4ef)] ring-1 ring-[var(--color-slate-700,#e8e4df)]">
            {existingPrimary || primary ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primary ? URL.createObjectURL(primary) : existingPrimary}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/25">
                <ImagePlus className="size-5" />
              </div>
            )}
          </div>
          <div className="size-14 overflow-hidden rounded-lg bg-[var(--color-slate-900,#f7f4ef)] ring-1 ring-[var(--color-slate-700,#e8e4df)]">
            {existingSecondary || secondary ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={secondary ? URL.createObjectURL(secondary) : existingSecondary}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-[10px] text-[var(--color-jewelry-black,#1a1814)]/30">
                Back
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          ref={primaryRef}
          type="file"
          accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => setPrimary(e.target.files?.[0] ?? null)}
        />
        <input
          ref={secondaryRef}
          type="file"
          accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => setSecondary(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => primaryRef.current?.click()}
          className="min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
        >
          {primary ? 'Change front photo' : existingPrimary ? 'Replace front' : 'Add front photo'}
        </button>
        <button
          type="button"
          onClick={() => secondaryRef.current?.click()}
          className="min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
        >
          {secondary ? 'Change back photo' : existingSecondary ? 'Replace back' : 'Add back photo (optional)'}
        </button>
      </div>
      {(primary || secondary) && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--kc-accent,#c41e3a)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Save photos
        </button>
      )}
    </li>
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
    <li className="kc-upload-card flex gap-3 rounded-2xl p-3 shadow-sm sm:p-4">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-[var(--color-slate-900,#f7f4ef)] sm:size-24">
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
            <p className="truncate font-semibold text-[var(--color-jewelry-black,#1a1814)]">{row.product_name || sku}</p>
            <p className="kc-upload-hint text-xs">
              {row.style_code} › {row.sku}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${submissionStatusTone(status)}`}
          >
            {submissionStatusLabel(status)}
          </span>
        </div>
        <p className="kc-upload-hint mt-1 text-xs">{formatWhen(row.created_at)}</p>
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
