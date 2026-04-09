'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Link2, FileText, Copy, Check, Share2 } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { useCatalogData } from '@/app/catalog/catalog-data-context'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'
import { createSharedCatalog } from '@/lib/shared-catalog-api'
import type { Item } from '@/lib/pricing'
import { CatalogPdfDocument } from '@/lib/catalog-pdf-document'
import { resolveItemsForPdf } from '@/lib/pdf-embed-images'
import { shareCatalogPdfBlob } from '@/lib/pdf-share'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'

const EXPIRY_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '2 hours', hours: 2 },
  { label: '12 hours', hours: 12 },
  { label: '24 hours', hours: 24 },
  { label: '2 days', hours: 48 },
] as const

type Props = {
  open: boolean
  onClose: () => void
}

type CatalogCategoryLite = { subcategories: { products: Item[] }[] }

function findProductsByBarcodes(
  categories: CatalogCategoryLite[],
  barcodes: Set<string>,
  order: string[],
): Item[] {
  const map = new Map<string, Item>()
  for (const c of categories) {
    for (const s of c.subcategories) {
      for (const p of s.products) {
        const k = String(p.barcode ?? p.sku ?? p.id ?? '').trim()
        if (k && barcodes.has(k) && !map.has(k)) map.set(k, p)
      }
    }
  }
  const out: Item[] = []
  for (const id of order) {
    const item = map.get(id)
    if (item) out.push(item)
  }
  return out
}

export default function WhatsAppCatalogModal({ open, onClose }: Props) {
  const { categories, rates } = useCatalogData()
  const { selectedProductIds, clearSelection } = useCatalogBuilder()
  const [outputFormat, setOutputFormat] = useState<'temporary_web_link' | 'pdf'>('temporary_web_link')
  const [markupPercentage, setMarkupPercentage] = useState(0)
  const [expiryHours, setExpiryHours] = useState<number>(24)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const expiresAtIso = useMemo(() => {
    const h = EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.hours ?? 24
    return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
  }, [expiryHours])

  const resetAndClose = useCallback(() => {
    setError(null)
    setShareUrl(null)
    setCopied(false)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      setError(null)
      setShareUrl(null)
      setCopied(false)
    }
  }, [open])

  const handleSubmit = useCallback(async () => {
    setError(null)
    setShareUrl(null)
    if (selectedProductIds.length === 0) {
      setError('No products selected.')
      return
    }
    setBusy(true)
    try {
      if (outputFormat === 'pdf') {
        const set = new Set(selectedProductIds)
        const items = findProductsByBarcodes(categories, set, selectedProductIds)
        if (items.length === 0) {
          setError('Could not resolve selected products. Refresh the catalogue and try again.')
          setBusy(false)
          return
        }
        const itemsForPdf = await resolveItemsForPdf(items)
        const blob = await pdf(
          <CatalogPdfDocument
            products={itemsForPdf}
            rates={rates}
            markupPercentage={markupPercentage}
          />,
        ).toBlob()
        const filename = `kc-jewellers-catalog-${new Date().toISOString().slice(0, 10)}.pdf`
        await shareCatalogPdfBlob(blob, filename)
        clearSelection()
        resetAndClose()
        return
      }

      const res = await createSharedCatalog({
        selectedProductIds,
        markupPercentage,
        format: 'temporary_web_link',
        expiresAt: expiresAtIso,
      })
      if (res.success && res.format === 'temporary_web_link') {
        setShareUrl(res.shareUrl)
      } else {
        setError('Unexpected response from server.')
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(msg || (e instanceof Error ? e.message : 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }, [
    selectedProductIds,
    outputFormat,
    markupPercentage,
    expiresAtIso,
    categories,
    rates,
    clearSelection,
    resetAndClose,
  ])

  const copyLink = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }, [shareUrl])

  const waShareHref = useMemo(() => {
    if (!shareUrl) return null
    const text = `KC Jewellers — curated catalogue for you:\n${shareUrl}`
    return buildWhatsAppShareLink(text)
  }, [shareUrl])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-catalog-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog backdrop"
        onClick={resetAndClose}
      />
      <div className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-md flex-col rounded-t-2xl border border-slate-700/80 bg-slate-950 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
          <h2 id="whatsapp-catalog-modal-title" className="text-base font-semibold text-slate-100">
            WhatsApp catalogue
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Output format</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutputFormat('temporary_web_link')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  outputFormat === 'temporary_web_link'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Link2 className="size-4" />
                <span className="font-medium">Temporary web link</span>
                <span className="text-[11px] opacity-80">Share a brochure URL</span>
              </button>
              <button
                type="button"
                onClick={() => setOutputFormat('pdf')}
                className={`flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  outputFormat === 'pdf'
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                    : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                }`}
              >
                <FileText className="size-4" />
                <span className="font-medium">PDF document</span>
                <span className="text-[11px] opacity-80">Download a printable PDF</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="markup-pct" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Global markup (%)
            </label>
            <input
              id="markup-pct"
              type="number"
              min={0}
              max={500}
              step={0.5}
              value={markupPercentage}
              onChange={(e) => setMarkupPercentage(Number(e.target.value) || 0)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none ring-amber-500/0 transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/30"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Applied on top of the live price incl. GST (e.g. 10 = +10%).
            </p>
          </div>

          {outputFormat === 'temporary_web_link' && (
            <div>
              <label htmlFor="expiry" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Link expires in
              </label>
              <select
                id="expiry"
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/30"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {shareUrl && (
            <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3">
              <p className="text-sm text-emerald-100/90">Your link is ready — share it on WhatsApp or copy it.</p>
              <p className="break-all rounded-lg bg-slate-900/80 px-2 py-1.5 font-mono text-[11px] text-slate-300">
                {shareUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {waShareHref && (
                  <a
                    href={waShareHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:bg-[#20bd5a]"
                  >
                    <Share2 className="size-3.5" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-4 sm:px-5">
          <button
            type="button"
            disabled={busy || !!shareUrl}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-900/20 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? 'Working…'
              : shareUrl
                ? 'Done'
                : outputFormat === 'pdf'
                  ? 'Generate PDF & share'
                  : 'Create share link'}
          </button>
        </div>
      </div>
    </div>
  )
}
