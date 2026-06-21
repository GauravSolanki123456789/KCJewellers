'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import axios from '@/lib/axios'
import {
  emptyProductPayload,
  submissionToCatalogItem,
  submissionImageDiskKey,
  submissionPreviewImageUrl,
  RESELLER_EXCEL_ACCEPT,
  RESELLER_PRODUCT_IMAGE_ACCEPT,
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  RESELLER_PRODUCT_VIDEO_ACCEPT,
  RESELLER_PRODUCT_VIDEO_MAX_BYTES,
  RESELLER_PRODUCT_VIDEO_MAX_LABEL,
  submissionStatusLabel,
  submissionStatusTone,
  type ResellerProductBatch,
  type ResellerProductPayload,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import {
  bulkPhotoKindLabel,
  submissionPhotoFilenames,
  uploadBatchPhotosBulk,
  type BulkPhotoKind,
} from '@/lib/reseller-bulk-photos'
import { calculateBreakdown, getCustomerDisplaySize, isFixedPriceCatalogItem } from '@/lib/pricing'
import { FileSpreadsheet, ImagePlus, Images, Loader2, Package, Plus, Send, Upload } from 'lucide-react'

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
  const [liveRates, setLiveRates] = useState<unknown>(null)
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

  useEffect(() => {
    if (tab !== 'batches' && tab !== 'add') return
    let cancelled = false
    void axios
      .get<{ rates?: unknown }>('/api/rates/display')
      .then((res) => {
        if (!cancelled) setLiveRates(res.data?.rates ?? null)
      })
      .catch(() => {
        if (!cancelled) setLiveRates(null)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const pendingCount = useMemo(() => rows.filter((r) => r.submission_status === 'pending').length, [rows])
  const draftBatchCount = useMemo(
    () => batches.filter((b) => (b.draft_count ?? 0) > 0).length,
    [batches],
  )

  const loadBatches = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setBatchesLoading(true)
    try {
      const res = await axios.get<ResellerProductBatch[]>('/api/reseller/product-batches')
      setBatches(Array.isArray(res.data) ? res.data : [])
    } catch {
      setBatches([])
    } finally {
      if (!opts?.silent) setBatchesLoading(false)
    }
  }, [])

  const loadBatchProducts = useCallback(async (batchId: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setBatchProductsLoading(true)
    try {
      const res = await axios.get<ResellerProductSubmission[]>('/api/reseller/product-submissions', {
        params: { batch_id: batchId, submission_status: 'draft' },
      })
      setBatchProducts(Array.isArray(res.data) ? res.data : [])
    } catch {
      setBatchProducts([])
    } finally {
      if (!opts?.silent) setBatchProductsLoading(false)
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

  const validateVideo = (file: File | null): string | null => {
    if (!file) return null
    if (file.size > RESELLER_PRODUCT_VIDEO_MAX_BYTES) {
      return `Video too large (max ${RESELLER_PRODUCT_VIDEO_MAX_LABEL})`
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

  const normalizeExcelRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      const key = String(k).trim()
      if (v == null) {
        out[key] = ''
        continue
      }
      if (typeof v === 'number' && key.toLowerCase().includes('size')) {
        out[key] = String(v)
        continue
      }
      out[key] = typeof v === 'string' ? v.trim() : v
    }
    return out
  }

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
          return normalizeExcelRow(row)
        })
        .filter(rowHasData)
    }
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      .map(normalizeExcelRow)
    return rows.filter(rowHasData)
  }

  const formatStyleSummary = (summary?: Record<string, number>) => {
    if (!summary || !Object.keys(summary).length) return ''
    return Object.entries(summary)
      .map(([style, n]) => `${style} (${n})`)
      .join(' · ')
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
        expected_count?: number
        batch_id?: string
        style_summary?: Record<string, number>
        errors?: { row: number; error: string; styleCode?: string; barcode?: string }[]
      }>('/api/reseller/product-submissions/bulk', { products })
      const n = res.data.created_count ?? 0
      const expected = res.data.expected_count ?? products.length
      const errs = res.data.errors ?? []
      const errN = errs.length
      const formatRowErr = (e: (typeof errs)[number]) => {
        const rowNo = e.row != null ? e.row + 1 : '?'
        const label = [e.styleCode, e.barcode].filter(Boolean).join(' · ')
        return `Row ${rowNo}${label ? ` (${label})` : ''}: ${e.error}`
      }
      if (n === 0) {
        const first = errs[0] ? formatRowErr(errs[0]) : null
        setError(
          first
            ? `No rows imported — ${first}${errN > 1 ? ` — and ${errN - 1} more` : ''}`
            : 'No rows imported. Check Barcode, StyleCode, and MetalType (use gifting for gift items).',
        )
        return
      }
      const partialHint =
        n < expected
          ? ` Expected ${expected} — ${errN} row${errN === 1 ? '' : 's'} skipped.${errs[0] ? ` First: ${formatRowErr(errs[0])}` : ''}`
          : errN
            ? ` (${errN} row${errN === 1 ? '' : 's'} skipped)`
            : ''
      const styleHint = formatStyleSummary(res.data.style_summary)
      setBulkResult(
        `${n} product${n === 1 ? '' : 's'} imported${styleHint ? ` — ${styleHint}` : ''}. Rename photos to each product’s barcode (shown below), then bulk-upload or add one-by-one. Send the batch when ready.${partialHint}`,
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

  const uploadPhotos = async (
    submissionId: number,
    primary: File | null,
    secondary: File | null,
    boxImage: File | null,
    video: File | null,
  ) => {
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
    const fd = new FormData()
    fd.append('payload', JSON.stringify({}))
    if (primary) {
      const imgErr = validateImage(primary)
      if (imgErr) throw new Error(imgErr)
      fd.append('primaryImage', primary, primary.name || 'front.webp')
    }
    if (secondary) {
      const imgErr = validateImage(secondary)
      if (imgErr) throw new Error(imgErr)
      fd.append('secondaryImage', secondary, secondary.name || 'back.webp')
    }
    if (boxImage) {
      const imgErr = validateImage(boxImage)
      if (imgErr) throw new Error(imgErr)
      fd.append('boxImage', boxImage, boxImage.name || 'box.webp')
    }
    if (video) {
      const vErr = validateVideo(video)
      if (vErr) throw new Error(vErr)
      fd.append('productVideo', video, video.name || 'video.mp4')
    }
    const res = await axios.put<{ success?: boolean; submission?: ResellerProductSubmission }>(
      `/api/reseller/product-submissions/${submissionId}`,
      fd,
    )
    const updated = res.data?.submission
    const prevRow = batchProducts.find((p) => p.id === submissionId)
    if (updated) {
      setBatchProducts((prev) =>
        prev.map((p) => (p.id === submissionId ? { ...p, ...updated } : p)),
      )
      if (expandedBatchId) {
        const hadPrimary = Boolean(prevRow?.image_url)
        const hasPrimaryNow = Boolean(updated.image_url)
        const hadSecondary = Boolean(prevRow?.secondary_image_url)
        const hasSecondaryNow = Boolean(updated.secondary_image_url)
        if (!hadPrimary && hasPrimaryNow) {
          setBatches((prev) =>
            prev.map((b) =>
              b.batch_id === expandedBatchId
                ? { ...b, with_primary_image: (b.with_primary_image ?? 0) + 1 }
                : b,
            ),
          )
        }
        if (!hadSecondary && hasSecondaryNow) {
          setBatches((prev) =>
            prev.map((b) =>
              b.batch_id === expandedBatchId
                ? { ...b, with_secondary_image: (b.with_secondary_image ?? 0) + 1 }
                : b,
            ),
          )
        }
      }
    } else if (expandedBatchId) {
      await loadBatchProducts(expandedBatchId, { silent: true })
      await loadBatches({ silent: true })
    }
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY)
      })
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
              className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-slate-700,#d6d3d1)] bg-[var(--color-slate-900,#f7f4ef)] px-4 py-4 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)]/40 hover:bg-white disabled:opacity-60"
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
                          {b.product_count} items
                          {b.style_codes?.length
                            ? ` · ${b.style_codes.join(' · ')}`
                            : ''}{' '}
                          · {b.with_primary_image}/{b.product_count} with front photo
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
                        {batchProducts.length > 0 ? (
                          <BatchBulkPhotoUpload
                            batchId={b.batch_id}
                            products={batchProducts}
                            onComplete={async () => {
                              await loadBatchProducts(b.batch_id, { silent: true })
                              await loadBatches({ silent: true })
                            }}
                          />
                        ) : null}
                        {batchProductsLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="size-6 animate-spin" />
                          </div>
                        ) : (
                          <ul className="mt-4 space-y-4">
                            {Object.entries(
                              batchProducts.reduce<Record<string, typeof batchProducts>>((acc, p) => {
                                const key = String(p.style_code || 'Uncategorized').trim() || 'Uncategorized'
                                if (!acc[key]) acc[key] = []
                                acc[key].push(p)
                                return acc
                              }, {}),
                            ).map(([styleCode, rows]) => (
                              <li key={styleCode}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                                  {styleCode} · {rows.length} item{rows.length === 1 ? '' : 's'}
                                </p>
                                <ul className="space-y-3">
                                  {rows.map((p) => (
                                    <BatchProductPhotoRow
                                      key={p.id}
                                      row={p}
                                      rates={liveRates}
                                      onSave={uploadPhotos}
                                    />
                                  ))}
                                </ul>
                              </li>
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

function formatLivePrice(total: number): string {
  return `₹${Math.round(total).toLocaleString('en-IN')}`
}

function BatchBulkPhotoUpload({
  batchId,
  products,
  onComplete,
}: {
  batchId: string
  products: ResellerProductSubmission[]
  onComplete: () => Promise<void>
}) {
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<BulkPhotoKind | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [showNames, setShowNames] = useState(false)

  const hasBoxProducts = useMemo(
    () => products.some((p) => Number(p.box_charges ?? 0) > 0),
    [products],
  )

  const filenameRows = useMemo(
    () =>
      products
        .map((p) => {
          const names = submissionPhotoFilenames(p)
          const label = p.product_name || submissionImageDiskKey(p) || p.barcode || `#${p.id}`
          return names ? { id: p.id, label, names } : null
        })
        .filter(Boolean) as {
        id: number
        label: string
        names: { front: string; back: string; box: string }
      }[],
    [products],
  )

  const handleBulk = async (kind: BulkPhotoKind, files: FileList | null) => {
    if (!files?.length) return
    setUploading(kind)
    setResult(null)
    try {
      const list = Array.from(files)
      const data = await uploadBatchPhotosBulk(batchId, kind, list)
      const unmatchedHint =
        data.unmatched.length > 0
          ? ` ${data.unmatched.length} file${data.unmatched.length === 1 ? '' : 's'} not matched (${data.unmatched.slice(0, 3).join(', ')}${data.unmatched.length > 3 ? '…' : ''}).`
          : ''
      const errHint =
        data.errors.length > 0 ? ` ${data.errors.length} error${data.errors.length === 1 ? '' : 's'}.` : ''
      setResult(
        `${data.matched} ${bulkPhotoKindLabel(kind)} photo${data.matched === 1 ? '' : 's'} linked.${unmatchedHint}${errHint}`,
      )
      await onComplete()
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null
      setResult(msg || 'Bulk upload failed')
    } finally {
      setUploading(null)
      if (frontRef.current) frontRef.current.value = ''
      if (backRef.current) backRef.current.value = ''
      if (boxRef.current) boxRef.current.value = ''
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-[var(--color-slate-700,#e8e4df)]">
          <Images className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Bulk upload photos</p>
          <p className="kc-upload-hint mt-1 text-xs leading-relaxed">
            Rename each image file to the product barcode shown below — e.g.{' '}
            <span className="font-mono text-[var(--kc-accent,#c41e3a)]">BAANI-01.webp</span> for front,{' '}
            <span className="font-mono text-[var(--color-jewelry-black,#1a1814)]/80">BAANI-01_secondary.webp</span>{' '}
            for back. Then pick many files at once on phone or laptop. One-by-one upload still works below.
          </p>
        </div>
      </div>

      <input
        ref={frontRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => void handleBulk('front', e.target.files)}
      />
      <input
        ref={backRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => void handleBulk('back', e.target.files)}
      />
      <input
        ref={boxRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => void handleBulk('box', e.target.files)}
      />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => frontRef.current?.click()}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--kc-accent,#c41e3a)]/25 bg-white px-3 py-2.5 text-sm font-semibold text-[var(--kc-accent,#c41e3a)] transition hover:bg-[var(--kc-accent,#c41e3a)]/5 disabled:opacity-60"
        >
          {uploading === 'front' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Bulk upload front images
        </button>
        <button
          type="button"
          disabled={Boolean(uploading)}
          onClick={() => backRef.current?.click()}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)]/30 disabled:opacity-60"
        >
          {uploading === 'back' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Bulk upload back images
        </button>
        {hasBoxProducts ? (
          <button
            type="button"
            disabled={Boolean(uploading)}
            onClick={() => boxRef.current?.click()}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100/80 disabled:opacity-60 sm:col-span-2"
          >
            {uploading === 'box' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Bulk upload with-box images
          </button>
        ) : null}
      </div>

      {result ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
          {result}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowNames((v) => !v)}
        className="mt-3 text-xs font-semibold text-[var(--kc-accent,#c41e3a)] underline-offset-2 hover:underline"
      >
        {showNames ? 'Hide barcode filename list' : `Show barcode filenames (${filenameRows.length})`}
      </button>

      {showNames ? (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
          <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)]">
            {filenameRows.map((row) => (
              <li key={row.id} className="px-3 py-2 text-[11px] leading-relaxed">
                <p className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{row.label}</p>
                <p className="mt-0.5 font-mono text-[var(--color-jewelry-black,#1a1814)]/70">
                  Front: <span className="text-[var(--kc-accent,#c41e3a)]">{row.names.front}</span>
                  {' · '}
                  Back: {row.names.back}
                  {hasBoxProducts && Number(products.find((p) => p.id === row.id)?.box_charges ?? 0) > 0
                    ? ` · Box: ${row.names.box}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function submissionLivePriceHint(row: ResellerProductSubmission, rates: unknown): string | null {
  const item = submissionToCatalogItem(row)
  if (isFixedPriceCatalogItem(item)) {
    const fp = Number(item.fixed_price ?? 0)
    return fp > 0 ? `${formatLivePrice(fp * 1.03)} incl. GST (fixed)` : null
  }
  const mt = String(row.metal_type || '').toLowerCase()
  if (!mt.startsWith('gold') && !mt.startsWith('silver')) return null
  const net = Number(row.net_weight ?? 0)
  if (!Number.isFinite(net) || net <= 0) return null
  const b = calculateBreakdown(item, rates, 3)
  return `${formatLivePrice(b.total)} · ${net.toFixed(3)} g`
}

function BatchProductPhotoRow({
  row,
  rates,
  onSave,
}: {
  row: ResellerProductSubmission
  rates: unknown
  onSave: (
    id: number,
    primary: File | null,
    secondary: File | null,
    boxImage: File | null,
    video: File | null,
  ) => Promise<void>
}) {
  const [primary, setPrimary] = useState<File | null>(null)
  const [secondary, setSecondary] = useState<File | null>(null)
  const [boxImage, setBoxImage] = useState<File | null>(null)
  const [video, setVideo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const primaryRef = useRef<HTMLInputElement>(null)
  const secondaryRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const diskKey = submissionImageDiskKey(row)
  const displayCode = diskKey || row.barcode || row.sku || ''
  const existingPrimary = submissionPreviewImageUrl(row)
  const existingSecondary = row.secondary_image_url || ''
  const existingBox = row.box_image_url || ''
  const existingVideo = row.video_url || ''
  const hasBoxCharge = Number(row.box_charges ?? 0) > 0
  const photoNames = submissionPhotoFilenames(row)
  const livePriceHint = submissionLivePriceHint(row, rates)

  const save = async () => {
    if (!primary && !secondary && !boxImage && !video) return
    const vErr = video && video.size > RESELLER_PRODUCT_VIDEO_MAX_BYTES
      ? `Video too large (max ${RESELLER_PRODUCT_VIDEO_MAX_LABEL})`
      : null
    if (vErr) {
      alert(vErr)
      return
    }
    setSaving(true)
    try {
      await onSave(row.id, primary, secondary, boxImage, video)
      setPrimary(null)
      setSecondary(null)
      setBoxImage(null)
      setVideo(null)
      if (primaryRef.current) primaryRef.current.value = ''
      if (secondaryRef.current) secondaryRef.current.value = ''
      if (boxRef.current) boxRef.current.value = ''
      if (videoRef.current) videoRef.current.value = ''
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null
      alert(msg || 'Could not save photos')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      id={`batch-product-${row.id}`}
      className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-[var(--color-jewelry-black,#1a1814)]">
            {row.product_name || displayCode}
          </p>
          <p className="kc-upload-hint text-xs">
            {row.style_code} › {row.sku}
            {row.size?.trim() ? ` · ${getCustomerDisplaySize(submissionToCatalogItem(row)) ?? row.size}` : ''}
            {row.fixed_price != null && Number(row.fixed_price) > 0 ? ` · ₹${row.fixed_price}` : ''}
            {hasBoxCharge ? ` · box +₹${Number(row.box_charges).toLocaleString('en-IN')}` : ''}
          </p>
          {livePriceHint ? (
            <p className="mt-1 text-xs font-medium tabular-nums text-emerald-800">{livePriceHint}</p>
          ) : null}
          {photoNames ? (
            <div className="mt-2 rounded-lg border border-[var(--kc-accent,#c41e3a)]/15 bg-[var(--color-slate-900,#f7f4ef)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                Rename files to
              </p>
              <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/85">
                <span className="text-[var(--kc-accent,#c41e3a)]">{photoNames.front}</span>
                {' · '}
                {photoNames.back}
                {hasBoxCharge ? (
                  <>
                    {' · '}
                    <span className="text-emerald-800">{photoNames.box}</span>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
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
          {(existingBox || boxImage) ? (
            <div className="size-14 overflow-hidden rounded-lg bg-[var(--color-slate-900,#f7f4ef)] ring-1 ring-emerald-500/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={boxImage ? URL.createObjectURL(boxImage) : existingBox}
                alt=""
                className="size-full object-cover"
              />
            </div>
          ) : null}
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
        <input
          ref={boxRef}
          type="file"
          accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => setBoxImage(e.target.files?.[0] ?? null)}
        />
        <input
          ref={videoRef}
          type="file"
          accept={RESELLER_PRODUCT_VIDEO_ACCEPT}
          className="sr-only"
          onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
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
        {hasBoxCharge ? (
          <button
            type="button"
            onClick={() => boxRef.current?.click()}
            className="min-h-[40px] rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900"
          >
            {boxImage ? 'Change with-box photo' : existingBox ? 'Replace with-box' : 'Add with-box photo'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          className="min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
        >
          {video ? 'Change video' : existingVideo ? 'Replace video' : `Add video (max ${RESELLER_PRODUCT_VIDEO_MAX_LABEL})`}
        </button>
      </div>
      {(primary || secondary || boxImage || video) && (
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
  const diskKey = submissionImageDiskKey(row)
  const displayCode = diskKey || row.barcode || row.sku || ''
  const img = submissionPreviewImageUrl(row)
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
            <p className="truncate font-semibold text-[var(--color-jewelry-black,#1a1814)]">{row.product_name || displayCode}</p>
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
