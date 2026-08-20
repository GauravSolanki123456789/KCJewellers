'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import {
  createPricelistCategory,
  createPricelistSharedLink,
  deletePricelistCategory,
  deletePricelistImportBatch,
  fetchPricelistBootstrap,
  fetchPricelistCategories,
  fetchPricelistImportBatches,
  fetchPricelistTree,
  formatSlabKeyLabel,
  uploadPricelistBulkPhotos,
  uploadPricelistExcelRows,
  uploadPricelistProductPhoto,
  type PricelistCategory,
  type PricelistImportBatch,
  type PricelistTreeCategory,
} from '@/lib/reseller-pricelist'
import { cn } from '@/lib/utils'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

function normalizeExcelRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const key = String(k || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
    if (key) out[key] = v
  }
  return out
}

function rowHasData(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) => String(v ?? '').trim() !== '')
}

async function parseExcelFile(file: File): Promise<Record<string, unknown>[]> {
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
  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    .map(normalizeExcelRow)
    .filter(rowHasData)
}

type ShareModalProps = {
  open: boolean
  onClose: () => void
  productIds: number[]
  slabKeys: string[]
  hidePdf: boolean
}

function PricelistShareModal({ open, onClose, productIds, slabKeys, hidePdf }: ShareModalProps) {
  const [format, setFormat] = useState<'temporary_web_link' | 'pdf'>('temporary_web_link')
  const [selectedSlabKey, setSelectedSlabKey] = useState('')
  const [expiresHours, setExpiresHours] = useState(24)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setShareUrl('')
    setError('')
    setCopied(false)
    setSelectedSlabKey('')
  }, [open])

  if (!open) return null

  const createLink = async () => {
    if (!productIds.length) {
      setError('Select at least one product')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await createPricelistSharedLink({
        productIds,
        selectedSlabKey: selectedSlabKey || null,
        format,
        expiresHours,
      })
      setShareUrl(data.shareUrl)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not create share link')
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricelist-share-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#faf8f4)] shadow-xl sm:rounded-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] bg-white/95 px-4 py-3 backdrop-blur-sm">
          <h2 id="pricelist-share-title" className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            WhatsApp pricelist
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-lg text-[var(--color-jewelry-black,#1a1814)]/60 hover:bg-[var(--color-slate-900,#f7f4ef)]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            {productIds.length} product{productIds.length === 1 ? '' : 's'} selected
          </p>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Output format
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('temporary_web_link')}
                className={cn(
                  'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition',
                  format === 'temporary_web_link'
                    ? 'border-emerald-600/40 bg-emerald-50 text-emerald-900'
                    : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70',
                )}
              >
                <Link2 className="size-4" />
                Temporary web link
              </button>
              {!hidePdf ? (
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={cn(
                    'flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition',
                    format === 'pdf'
                      ? 'border-emerald-600/40 bg-emerald-50 text-emerald-900'
                      : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70',
                  )}
                >
                  <FileSpreadsheet className="size-4" />
                  PDF brochure
                </button>
              ) : null}
            </div>
          </div>

          {slabKeys.length ? (
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Price slab
              </label>
              <select
                value={selectedSlabKey}
                onChange={(e) => setSelectedSlabKey(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm text-[var(--color-jewelry-black,#1a1814)]"
              >
                <option value="">None — weight only</option>
                {slabKeys.map((k) => (
                  <option key={k} value={k}>
                    {formatSlabKeyLabel(k)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
              Link expires in
            </label>
            <select
              value={expiresHours}
              onChange={(e) => setExpiresHours(parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm text-[var(--color-jewelry-black,#1a1814)]"
            >
              <option value={2}>2 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {shareUrl ? (
            <div className="rounded-xl border border-emerald-600/30 bg-emerald-50/80 p-3">
              <p className="text-xs font-medium text-emerald-900">Share link ready</p>
              <p className="mt-1 break-all text-xs text-emerald-800/90">{shareUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyUrl()}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Pricelist: ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-600/40 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
                >
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                </a>
              </div>
              {format === 'pdf' ? (
                <p className="mt-2 text-[11px] text-emerald-800/80">
                  Open the link on your phone or desktop — customers can shortlist items and share on WhatsApp.
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={busy || !productIds.length}
              onClick={() => void createLink()}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Create share link
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ResellerPricelistPanel() {
  const [tab, setTab] = useState<'manage' | 'share'>('manage')
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<PricelistCategory[]>([])
  const [tree, setTree] = useState<PricelistTreeCategory[]>([])
  const [slabKeys, setSlabKeys] = useState<string[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set())
  const [expandedSubs, setExpandedSubs] = useState<Set<number>>(new Set())
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [excelBusy, setExcelBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastBatchId, setLastBatchId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [hidePdf, setHidePdf] = useState(false)
  const [importBatches, setImportBatches] = useState<PricelistImportBatch[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [manageExpandedCatId, setManageExpandedCatId] = useState<number | null>(null)
  const [manageExpandedSubs, setManageExpandedSubs] = useState<Set<number>>(new Set())
  const [productPhotoBusyId, setProductPhotoBusyId] = useState<number | null>(null)
  const excelInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const productPhotoInputRef = useRef<HTMLInputElement>(null)
  const pendingProductPhotoId = useRef<number | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [boot, cats, tr] = await Promise.all([
        fetchPricelistBootstrap(),
        fetchPricelistCategories(),
        fetchPricelistTree(),
      ])
      setCategories(cats)
      setTree(tr)
      setSlabKeys(boot.slabKeys || [])
      if (activeCategoryId == null && cats[0]?.id) setActiveCategoryId(cats[0].id)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Failed to load pricelist')
    } finally {
      setLoading(false)
    }
  }, [activeCategoryId])

  useEffect(() => {
    void reload()
    void axios.get('/api/auth/me').then((res) => {
      const u = res.data as { reseller_hide_shared_catalog_pdf?: boolean }
      setHidePdf(!!u?.reseller_hide_shared_catalog_pdf)
    }).catch(() => {})
  }, [reload])

  const loadBatches = useCallback(async (categoryId: number) => {
    setBatchesLoading(true)
    try {
      const batches = await fetchPricelistImportBatches(categoryId)
      setImportBatches(batches)
    } catch {
      setImportBatches([])
    } finally {
      setBatchesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'manage' && manageExpandedCatId != null) {
      void loadBatches(manageExpandedCatId)
    }
  }, [tab, manageExpandedCatId, loadBatches, tree])

  const allProductIds = useMemo(() => {
    const ids: number[] = []
    for (const cat of tree) {
      for (const sc of cat.subcategories) {
        for (const p of sc.products) ids.push(p.id)
      }
    }
    return ids
  }, [tree])

  const toggleProduct = (id: number) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setProductsChecked = (ids: number[], checked: boolean) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const addCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setError('')
    try {
      const cat = await createPricelistCategory(name)
      setNewCategoryName('')
      setMessage(`Category "${cat.name}" created`)
      setActiveCategoryId(cat.id)
      await reload()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not create category')
    }
  }

  const removeCategory = async (id: number, name: string) => {
    if (!window.confirm(`Delete category "${name}" and all its products? This cannot be undone.`)) return
    try {
      await deletePricelistCategory(id)
      if (activeCategoryId === id) setActiveCategoryId(null)
      setMessage(`Deleted "${name}"`)
      await reload()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Delete failed')
    }
  }

  const handleExcel = async (file: File, categoryId: number) => {
    setExcelBusy(true)
    setError('')
    setMessage('')
    try {
      const rows = await parseExcelFile(file)
      if (!rows.length) {
        setError('No rows found in spreadsheet')
        return
      }
      const res = await uploadPricelistExcelRows(categoryId, rows, file.name)
      const n = res.upserted ?? 0
      if (res.batch_id) setLastBatchId(res.batch_id)
      const errN = res.errors?.length ?? 0
      setMessage(
        `${n} product${n === 1 ? '' : 's'} imported from "${file.name}"${errN ? ` (${errN} row${errN === 1 ? '' : 's'} skipped)` : ''}. Re-upload the same Excel anytime to update weights or slab rates.`,
      )
      await reload()
      if (manageExpandedCatId === categoryId) await loadBatches(categoryId)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Excel import failed')
    } finally {
      setExcelBusy(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  const handlePhotos = async (files: FileList | null, categoryId: number) => {
    if (!files?.length) return
    setPhotoBusy(true)
    setError('')
    try {
      const res = await uploadPricelistBulkPhotos(
        categoryId,
        Array.from(files),
        lastBatchId || undefined,
      )
      const matched = res.matched?.length ?? 0
      const unmatched = res.unmatched?.length ?? 0
      setMessage(
        `${matched} photo${matched === 1 ? '' : 's'} attached${unmatched ? ` · ${unmatched} unmatched` : ''}`,
      )
      await reload()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Photo upload failed')
    } finally {
      setPhotoBusy(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const removeImportBatch = async (categoryId: number, batch: PricelistImportBatch) => {
    if (
      !window.confirm(
        `Delete "${batch.source_filename}" and its ${batch.product_count} product${batch.product_count === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return
    }
    try {
      const res = await deletePricelistImportBatch(categoryId, batch.id)
      setMessage(`Removed ${res.deletedProducts} product${res.deletedProducts === 1 ? '' : 's'} from "${batch.source_filename}"`)
      await reload()
      await loadBatches(categoryId)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not delete Excel import')
    }
  }

  const handleSingleProductPhoto = async (productId: number, file: File) => {
    setProductPhotoBusyId(productId)
    setError('')
    try {
      await uploadPricelistProductPhoto(productId, file)
      setMessage('Photo attached')
      await reload()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Photo upload failed')
    } finally {
      setProductPhotoBusyId(null)
      if (productPhotoInputRef.current) productPhotoInputRef.current.value = ''
      pendingProductPhotoId.current = null
    }
  }

  const openCategoryManage = (catId: number) => {
    setActiveCategoryId(catId)
    setManageExpandedCatId((prev) => (prev === catId ? null : catId))
  }

  const activeTreeCategory = useMemo(
    () => tree.find((c) => c.id === manageExpandedCatId) ?? null,
    [tree, manageExpandedCatId],
  )

  const photoNameSamples = useMemo(() => {
    if (!activeTreeCategory) return []
    const samples: string[] = []
    for (const sc of activeTreeCategory.subcategories) {
      for (const p of sc.products.slice(0, 6)) {
        if (p.product_slug) samples.push(`${p.product_slug}.webp`)
      }
    }
    return samples.slice(0, 8)
  }, [activeTreeCategory])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['manage', 'share'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'min-h-[40px] rounded-xl px-4 py-2 text-sm font-semibold transition',
              tab === key
                ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                : 'border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/75',
            )}
          >
            {key === 'manage' ? 'Categories & upload' : 'Select & share'}
          </button>
        ))}
      </div>

      {message ? (
        <p className="rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {tab === 'manage' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">New pricelist category</p>
            <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              e.g. Jewellery, EF Idol, Solid Idol — each category gets its own Excel upload.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 text-sm text-[var(--color-jewelry-black,#1a1814)]"
              />
              <button
                type="button"
                onClick={() => void addCategory()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-sm font-semibold text-white"
              >
                <Plus className="size-4" />
                Add
              </button>
            </div>
          </div>

          {categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              No categories yet. Create one above, then upload Excel with columns like
              PRICELISTSUBCATEGORY, PRICELISTPRODUCTNAME, PRICELISTAVGWT, PRICELISTSLAB1… (or
              SUBCATEGORY, PRODUCTNAME, WEIGHT, SLAB1…).
            </p>
          ) : (
            <ul className="space-y-3">
              <input
                ref={productPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  const pid = pendingProductPhotoId.current
                  if (f && pid) void handleSingleProductPhoto(pid, f)
                }}
              />
              {categories.map((cat) => {
                const isOpen = manageExpandedCatId === cat.id
                const treeCat = tree.find((c) => c.id === cat.id)
                return (
                  <li
                    key={cat.id}
                    className={cn(
                      'overflow-hidden rounded-2xl border transition',
                      isOpen
                        ? 'border-[var(--kc-accent,#c41e3a)]/35 bg-white shadow-sm'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white/80',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 p-4">
                      <button
                        type="button"
                        onClick={() => openCategoryManage(cat.id)}
                        className="flex min-h-[44px] flex-1 items-center gap-2 text-left"
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/50" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/50" />
                        )}
                        <span>
                          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{cat.name}</p>
                          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                            {cat.product_count ?? 0} product{(cat.product_count ?? 0) === 1 ? '' : 's'}
                          </p>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeCategory(cat.id, cat.name)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-medium text-rose-700"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </button>
                    </div>

                    {isOpen ? (
                      <div className="space-y-4 border-t border-[var(--color-slate-700,#e8e4df)] px-4 pb-4 pt-4">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            ref={excelInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0]
                              if (f) void handleExcel(f, cat.id)
                            }}
                          />
                          <button
                            type="button"
                            disabled={excelBusy}
                            onClick={() => excelInputRef.current?.click()}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
                          >
                            {excelBusy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="size-4" />
                            )}
                            Upload / update Excel
                          </button>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => void handlePhotos(e.target.files, cat.id)}
                          />
                          <button
                            type="button"
                            disabled={photoBusy}
                            onClick={() => photoInputRef.current?.click()}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
                          >
                            {photoBusy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <ImagePlus className="size-4" />
                            )}
                            Bulk photos
                          </button>
                        </div>

                        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                            Excel uploads
                          </p>
                          {batchesLoading ? (
                            <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Loading…</p>
                          ) : importBatches.length === 0 ? (
                            <p className="mt-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                              No Excel imports yet. Upload INDIAN_PRICELIST.xlsx (or similar) above.
                            </p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {importBatches.map((batch) => (
                                <li
                                  key={batch.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                                      {batch.source_filename}
                                    </p>
                                    <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                                      {batch.product_count} product{batch.product_count === 1 ? '' : 's'} ·{' '}
                                      {new Date(batch.created_at).toLocaleString('en-IN', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                      })}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void removeImportBatch(cat.id, batch)}
                                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-[11px] font-medium text-rose-700"
                                  >
                                    <Trash2 className="size-3" />
                                    Delete
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
                            Re-upload the same Excel to update weights or slab rates. Delete an import to remove
                            all products from that upload.
                          </p>
                        </div>

                        {photoNameSamples.length ? (
                          <div className="rounded-xl border border-amber-500/25 bg-amber-50/80 p-3">
                            <p className="text-xs font-semibold text-amber-950">Photo file names (bulk upload)</p>
                            <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80">
                              Rename each image to match the product slug, then use Bulk photos — or tap Upload on
                              each product below.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {photoNameSamples.map((name) => (
                                <code
                                  key={name}
                                  className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] text-amber-950 ring-1 ring-amber-500/20"
                                >
                                  {name}
                                </code>
                              ))}
                              {(treeCat?.subcategories.reduce((n, sc) => n + sc.products.length, 0) ?? 0) >
                              photoNameSamples.length ? (
                                <span className="self-center text-[10px] text-amber-900/70">+ more</span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {!treeCat?.subcategories.length ? (
                          <p className="py-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                            Upload Excel to add subcategories and products.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {treeCat.subcategories.map((sc) => {
                              const scOpen = manageExpandedSubs.has(sc.id)
                              return (
                                <div
                                  key={sc.id}
                                  className="overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)]"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setManageExpandedSubs((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(sc.id)) next.delete(sc.id)
                                        else next.add(sc.id)
                                        return next
                                      })
                                    }
                                    className="flex w-full min-h-[44px] items-center gap-2 bg-[var(--color-slate-900,#f7f4ef)]/50 px-3 py-2.5 text-left"
                                  >
                                    {scOpen ? (
                                      <ChevronDown className="size-4 opacity-50" />
                                    ) : (
                                      <ChevronRight className="size-4 opacity-50" />
                                    )}
                                    <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">
                                      {sc.name}
                                    </span>
                                    <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
                                      {sc.products.length}
                                    </span>
                                  </button>
                                  {scOpen ? (
                                    <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)]/50">
                                      {sc.products.map((p) => (
                                        <li
                                          key={p.id}
                                          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center"
                                        >
                                          <div className="flex min-w-0 flex-1 items-center gap-3">
                                            {p.image_url ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                src={normalizeCatalogImageSrc(p.image_url) || p.image_url}
                                                alt=""
                                                className="size-12 shrink-0 rounded-lg object-cover"
                                              />
                                            ) : (
                                              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]/25">
                                                <ImagePlus className="size-5" />
                                              </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                                                {p.product_name}
                                              </p>
                                              <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                                                Photo: <code className="text-[10px]">{p.product_slug}.webp</code>
                                                {p.avg_weight != null ? ` · ${p.avg_weight} gm` : ''}
                                              </p>
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            disabled={productPhotoBusyId === p.id}
                                            onClick={() => {
                                              pendingProductPhotoId.current = p.id
                                              productPhotoInputRef.current?.click()
                                            }}
                                            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
                                          >
                                            {productPhotoBusyId === p.id ? (
                                              <Loader2 className="size-3.5 animate-spin" />
                                            ) : (
                                              <ImagePlus className="size-3.5" />
                                            )}
                                            Upload photo
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
              {selectedProducts.size} selected · max {allProductIds.length || '—'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setProductsChecked(allProductIds, true)}
                className="min-h-[36px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 text-xs font-medium"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedProducts(new Set())}
                className="min-h-[36px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-3 text-xs font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!selectedProducts.size}
                onClick={() => setShareOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Share2 className="size-4" />
                Generate WhatsApp pricelist
              </button>
            </div>
          </div>

          {tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              Upload Excel in a category first.
            </p>
          ) : (
            <div className="space-y-2">
              {tree.map((cat) => {
                const catProductIds = cat.subcategories.flatMap((sc) => sc.products.map((p) => p.id))
                const catAllSelected =
                  catProductIds.length > 0 && catProductIds.every((id) => selectedProducts.has(id))
                const catOpen = expandedCats.has(cat.id)
                return (
                  <div
                    key={cat.id}
                    className="overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={catAllSelected}
                        onChange={(e) => setProductsChecked(catProductIds, e.target.checked)}
                        className="size-4 rounded border-slate-300"
                        aria-label={`Select all in ${cat.name}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCats((prev) => {
                            const next = new Set(prev)
                            if (next.has(cat.id)) next.delete(cat.id)
                            else next.add(cat.id)
                            return next
                          })
                        }
                        className="flex min-h-[40px] flex-1 items-center gap-2 text-left"
                      >
                        {catOpen ? (
                          <ChevronDown className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/50" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/50" />
                        )}
                        <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{cat.name}</span>
                        <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
                          {catProductIds.length}
                        </span>
                      </button>
                    </div>
                    {catOpen
                      ? cat.subcategories.map((sc) => {
                          const scIds = sc.products.map((p) => p.id)
                          const scAll =
                            scIds.length > 0 && scIds.every((id) => selectedProducts.has(id))
                          const scOpen = expandedSubs.has(sc.id)
                          return (
                            <div key={sc.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                              <div className="flex items-center gap-2 bg-[var(--color-slate-900,#f7f4ef)]/50 px-3 py-2 pl-6">
                                <input
                                  type="checkbox"
                                  checked={scAll}
                                  onChange={(e) => setProductsChecked(scIds, e.target.checked)}
                                  className="size-4 rounded border-slate-300"
                                  aria-label={`Select ${sc.name}`}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedSubs((prev) => {
                                      const next = new Set(prev)
                                      if (next.has(sc.id)) next.delete(sc.id)
                                      else next.add(sc.id)
                                      return next
                                    })
                                  }
                                  className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
                                >
                                  {scOpen ? (
                                    <ChevronDown className="size-3.5 opacity-50" />
                                  ) : (
                                    <ChevronRight className="size-3.5 opacity-50" />
                                  )}
                                  {sc.name}
                                  <span className="text-xs font-normal opacity-50">{sc.products.length}</span>
                                </button>
                              </div>
                              {scOpen ? (
                                <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)]/40">
                                  {sc.products.map((p) => (
                                    <li
                                      key={p.id}
                                      className="flex items-center gap-3 px-3 py-2.5 pl-10"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedProducts.has(p.id)}
                                        onChange={() => toggleProduct(p.id)}
                                        className="size-4 shrink-0 rounded border-slate-300"
                                      />
                                      {p.image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={normalizeCatalogImageSrc(p.image_url) || p.image_url}
                                          alt=""
                                          className="size-10 shrink-0 rounded-lg object-cover"
                                        />
                                      ) : (
                                        <div className="size-10 shrink-0 rounded-lg bg-[var(--color-slate-900,#f7f4ef)]" />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                                          {p.product_name}
                                        </p>
                                        {p.avg_weight != null ? (
                                          <p className="text-xs text-amber-800/90">{p.avg_weight} gm avg</p>
                                        ) : null}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          )
                        })
                      : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <PricelistShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        productIds={[...selectedProducts]}
        slabKeys={slabKeys}
        hidePdf={hidePdf}
      />
    </div>
  )
}
