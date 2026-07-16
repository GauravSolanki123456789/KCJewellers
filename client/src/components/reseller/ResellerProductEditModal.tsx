'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  emptyProductPayload,
  submissionToPayload,
  applyDerivedGrossWeight,
  submissionPreviewImageUrl,
  submissionToCatalogItem,
  RESELLER_PRODUCT_IMAGE_ACCEPT,
  RESELLER_PRODUCT_IMAGE_MAX_BYTES,
  RESELLER_PRODUCT_IMAGE_MAX_LABEL,
  RESELLER_PRODUCT_VIDEO_ACCEPT,
  RESELLER_PRODUCT_VIDEO_MAX_BYTES,
  RESELLER_PRODUCT_VIDEO_MAX_LABEL,
  type ResellerProductPayload,
  type ResellerProductSubmission,
} from '@/lib/reseller-products'
import { calculateBreakdown, isMcPerPiece } from '@/lib/pricing'
import { ratesApiQueryForStorefront } from '@/lib/storefront-domain'
import { ImagePlus, Loader2, Save, X } from 'lucide-react'

const METAL_OPTIONS = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'gifting', label: 'Gift Items' },
]

const MC_TYPE_OPTIONS = [
  { value: 'MC/PC', label: 'MC/PC — per piece (flat)' },
  { value: 'MC/GM', label: 'MC/GM — per gram × net weight' },
]

function defaultMcTypeForMetal(metalType: string | undefined, mcRate: unknown): string {
  const rate = Number(mcRate)
  if (!Number.isFinite(rate) || rate <= 0) return 'MC/PC'
  const mt = String(metalType || 'silver').toLowerCase()
  if (mt.startsWith('silver') || mt.startsWith('gift')) return 'MC/PC'
  return 'MC/GM'
}

type Props = {
  open: boolean
  row: ResellerProductSubmission | null
  onClose: () => void
  onSaved: (updated: ResellerProductSubmission) => void
  /** Live (approved) edits sync site-wide immediately. */
  isLiveEdit?: boolean
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

function ImageSlot({
  label,
  existingUrl,
  file,
  onPick,
  inputRef,
}: {
  label: string
  existingUrl: string
  file: File | null
  onPick: (f: File | null) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const preview = file ? URL.createObjectURL(file) : existingUrl
  return (
    <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
      <p className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-[var(--color-slate-700,#e8e4df)]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/25">
              <ImagePlus className="size-5" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-[40px] flex-1 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
        >
          {file ? 'Change file' : existingUrl ? 'Replace' : 'Upload'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={RESELLER_PRODUCT_IMAGE_ACCEPT}
        className="sr-only"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

export function ResellerProductEditModal({ open, row, onClose, onSaved, isLiveEdit }: Props) {
  const [form, setForm] = useState<ResellerProductPayload>(emptyProductPayload())
  const [primaryFile, setPrimaryFile] = useState<File | null>(null)
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null)
  const [boxFile, setBoxFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liveRates, setLiveRates] = useState<unknown>(null)
  const primaryRef = useRef<HTMLInputElement>(null)
  const secondaryRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get(`/api/rates/display${ratesApiQueryForStorefront()}`)
        if (!cancelled) setLiveRates(res.data?.rates ?? res.data ?? null)
      } catch {
        if (!cancelled) setLiveRates(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const pricePreview = useMemo(() => {
    if (!row || !liveRates) return null
    const draftRow: ResellerProductSubmission = {
      ...row,
      net_weight: form.netWeight != null && form.netWeight !== '' ? Number(form.netWeight) : row.net_weight,
      gross_weight: form.grossWeight != null && form.grossWeight !== '' ? Number(form.grossWeight) : row.gross_weight,
      purity: form.purity ?? row.purity,
      mc_rate: form.mcRate != null && form.mcRate !== '' ? Number(form.mcRate) : row.mc_rate,
      mc_type: form.mcType || row.mc_type || defaultMcTypeForMetal(form.metalType, form.mcRate),
      metal_type: form.metalType || row.metal_type,
      wastage_pct:
        form.wastage_pct != null && form.wastage_pct !== ''
          ? Number(form.wastage_pct)
          : form.wastage != null && form.wastage !== ''
            ? Number(form.wastage)
            : row.wastage_pct,
      fixed_price: form.fixedPrice != null && form.fixedPrice !== '' ? Number(form.fixedPrice) : row.fixed_price,
      stone_charges: form.stoneCharges != null && form.stoneCharges !== '' ? Number(form.stoneCharges) : row.stone_charges,
    }
    const item = submissionToCatalogItem(draftRow)
    const breakdown = calculateBreakdown(item, liveRates, 3)
    return breakdown
  }, [row, form, liveRates])

  useEffect(() => {
    if (!open || !row) return
    setForm(applyDerivedGrossWeight(submissionToPayload(row)))
    setPrimaryFile(null)
    setSecondaryFile(null)
    setBoxFile(null)
    setVideoFile(null)
    setError(null)
  }, [open, row])

  const syncGrossFromNetWastage = useCallback((draft: ResellerProductPayload): ResellerProductPayload => {
    return applyDerivedGrossWeight(draft)
  }, [])

  const setField = useCallback(<K extends keyof ResellerProductPayload>(key: K, value: ResellerProductPayload[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'netWeight' || key === 'wastage' || key === 'wastage_pct') {
        return syncGrossFromNetWastage(next)
      }
      return next
    })
  }, [syncGrossFromNetWastage])

  if (!open || !row) return null

  const hasBoxCharge =
    Number(row.box_charges ?? 0) > 0 || Number(form.boxCharges ?? 0) > 0
  const existingPrimary = submissionPreviewImageUrl(row)
  const existingSecondary = row.secondary_image_url || ''
  const existingBox = row.box_image_url || ''
  const existingVideo = row.video_url || ''

  const validateImage = (file: File | null): string | null => {
    if (!file) return null
    if (file.size > RESELLER_PRODUCT_IMAGE_MAX_BYTES) {
      return `Image too large (max ${RESELLER_PRODUCT_IMAGE_MAX_LABEL})`
    }
    return null
  }

  const save = async () => {
    setError(null)
    for (const f of [primaryFile, secondaryFile, boxFile]) {
      const err = validateImage(f)
      if (err) {
        setError(err)
        return
      }
    }
    if (videoFile && videoFile.size > RESELLER_PRODUCT_VIDEO_MAX_BYTES) {
      setError(`Video too large (max ${RESELLER_PRODUCT_VIDEO_MAX_LABEL})`)
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('payload', JSON.stringify(applyDerivedGrossWeight(form)))
      if (primaryFile) fd.append('primaryImage', primaryFile, primaryFile.name || 'front.webp')
      if (secondaryFile) fd.append('secondaryImage', secondaryFile, secondaryFile.name || 'back.webp')
      if (boxFile) fd.append('boxImage', boxFile, boxFile.name || 'box.webp')
      if (videoFile) fd.append('productVideo', videoFile, videoFile.name || 'video.mp4')

      const res = await axios.put<{ success?: boolean; submission?: ResellerProductSubmission }>(
        `/api/reseller/product-submissions/${row.id}`,
        fd,
      )
      if (res.data?.submission) {
        onSaved(res.data.submission)
        onClose()
      } else {
        setError('Save succeeded but response was incomplete. Refresh the list.')
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : e instanceof Error
            ? e.message
            : null
      setError(msg || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reseller-edit-title"
    >
      <div className="kc-upload-card flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="reseller-edit-title" className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Edit product
            </h2>
            <p className="kc-upload-hint mt-0.5 truncate text-xs">
              {row.product_name || row.barcode || row.sku}
              {isLiveEdit ? ' · saves live on KC site' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70 transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {isLiveEdit ? (
            <p className="rounded-xl border border-emerald-500/25 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-900">
              Changes apply immediately across the catalogue, shared links, and cart — no admin review needed.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="StyleCode">
              <input
                className={inputCls}
                value={form.styleCode}
                onChange={(e) => setField('styleCode', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="SKU">
              <input
                className={inputCls}
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Barcode">
              <input
                className={inputCls}
                value={form.barcode || ''}
                onChange={(e) => setField('barcode', e.target.value)}
              />
            </Field>
            <Field label="Product name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
              />
            </Field>
            <Field label="Metal type">
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
            <Field label="Size (inches)">
              <input
                className={inputCls}
                value={form.size || ''}
                onChange={(e) => setField('size', e.target.value)}
                placeholder="e.g. 18 INCHES"
              />
            </Field>
            <Field label="Net weight (g)">
              <input
                className={inputCls}
                type="number"
                step="0.001"
                value={form.netWeight ?? ''}
                onChange={(e) => setField('netWeight', e.target.value)}
              />
            </Field>
            <Field label="Gross weight (g)" hint="Auto from net + wastage % when wastage is set">
              <input
                className={inputCls}
                type="number"
                step="0.001"
                value={form.grossWeight ?? ''}
                onChange={(e) => setField('grossWeight', e.target.value)}
              />
            </Field>
            <Field label="Purity">
              <input
                className={inputCls}
                value={form.purity || ''}
                onChange={(e) => setField('purity', e.target.value)}
              />
            </Field>
            <Field label="MC rate">
              <input
                className={inputCls}
                type="number"
                value={form.mcRate ?? ''}
                onChange={(e) => setField('mcRate', e.target.value)}
              />
            </Field>
            <Field
              label="MC type"
              hint={
                isMcPerPiece(form.mcType || row.mc_type || defaultMcTypeForMetal(form.metalType, form.mcRate))
                  ? 'Flat making charge per piece (e.g. 700 MC/PC)'
                  : 'Making charge × net weight in grams'
              }
            >
              <select
                className={inputCls}
                value={form.mcType || row.mc_type || defaultMcTypeForMetal(form.metalType, form.mcRate)}
                onChange={(e) => setField('mcType', e.target.value)}
              >
                {MC_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Wastage %">
              <input
                className={inputCls}
                type="number"
                step="0.01"
                value={form.wastage ?? form.wastage_pct ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setForm((f) => applyDerivedGrossWeight({ ...f, wastage: v, wastage_pct: v }))
                }}
              />
            </Field>
            <Field label="Fixed price (₹)" hint="Gift / MRP items">
              <input
                className={inputCls}
                type="number"
                min={0}
                value={form.fixedPrice ?? ''}
                onChange={(e) => setField('fixedPrice', e.target.value)}
              />
            </Field>
            <Field label="Stone charges">
              <input
                className={inputCls}
                type="number"
                value={form.stoneCharges ?? ''}
                onChange={(e) => setField('stoneCharges', e.target.value)}
              />
            </Field>
            <Field label="Box charges">
              <input
                className={inputCls}
                type="number"
                value={form.boxCharges ?? ''}
                onChange={(e) => setField('boxCharges', e.target.value)}
              />
            </Field>
            <Field label="Design group">
              <input
                className={inputCls}
                value={form.itemCode || ''}
                onChange={(e) => setField('itemCode', e.target.value)}
              />
            </Field>
          </div>

          {pricePreview ? (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80">
                Live catalogue price (incl. GST)
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                ₹{Math.round(pricePreview.total).toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
                Metal ₹{Math.round(pricePreview.metal).toLocaleString('en-IN')} + MC ₹
                {Math.round(pricePreview.mc).toLocaleString('en-IN')}
                {pricePreview.stone > 0
                  ? ` + stones ₹${Math.round(pricePreview.stone).toLocaleString('en-IN')}`
                  : ''}{' '}
                + GST
              </p>
            </div>
          ) : null}

          <div>
            <p className="kc-upload-label mb-2 text-xs font-medium">Photos &amp; video</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ImageSlot
                label="Front photo"
                existingUrl={existingPrimary}
                file={primaryFile}
                onPick={setPrimaryFile}
                inputRef={primaryRef}
              />
              <ImageSlot
                label="Back photo"
                existingUrl={existingSecondary}
                file={secondaryFile}
                onPick={setSecondaryFile}
                inputRef={secondaryRef}
              />
              {hasBoxCharge ? (
                <ImageSlot
                  label="With-box photo"
                  existingUrl={existingBox}
                  file={boxFile}
                  onPick={setBoxFile}
                  inputRef={boxRef}
                />
              ) : null}
            </div>
            <div className="mt-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3">
              <p className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">Product video</p>
              <button
                type="button"
                onClick={() => videoRef.current?.click()}
                className="mt-2 min-h-[40px] w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
              >
                {videoFile ? 'Change video' : existingVideo ? 'Replace video' : `Add video (max ${RESELLER_PRODUCT_VIDEO_MAX_LABEL})`}
              </button>
              <input
                ref={videoRef}
                type="file"
                accept={RESELLER_PRODUCT_VIDEO_ACCEPT}
                className="sr-only"
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-[var(--color-slate-700,#e8e4df)] p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[48px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />}
            {saving ? 'Saving…' : isLiveEdit ? 'Save live' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
