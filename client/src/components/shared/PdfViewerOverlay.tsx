'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Download, FileText, Loader2, MessageCircle, Share2, X } from 'lucide-react'
import {
  closePdfOverlay,
  getPdfOverlayPayload,
  subscribePdfOverlay,
} from '@/lib/pdf-viewer-overlay-store'
import { downloadPdfBlob, sharePdfFileNative } from '@/lib/pdf-share'
import { openExternalUrl, shouldUseSameTabWhatsAppNavigation } from '@/lib/cart-order-whatsapp'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'

export default function PdfViewerOverlay() {
  const payload = useSyncExternalStore(subscribePdfOverlay, getPdfOverlayPayload, () => null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [waMode, setWaMode] = useState<'pick' | 'customer'>('pick')

  useEffect(() => {
    if (!payload?.blob) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(payload.blob)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [payload?.blob])

  useEffect(() => {
    if (!payload) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [payload])

  const close = useCallback(() => closePdfOverlay(), [])

  const opts = payload?.opts
  const blob = payload?.blob

  const handleDownload = useCallback(() => {
    if (!blob || !opts?.filename) return
    downloadPdfBlob(blob, opts.filename)
  }, [blob, opts?.filename])

  const handleShareNative = useCallback(async () => {
    if (!blob || !opts || sharing) return
    setSharing(true)
    try {
      await sharePdfFileNative(blob, opts.filename, {
        title: opts.title || opts.filename,
        text: opts.text || opts.filename,
      })
    } finally {
      setSharing(false)
    }
  }, [blob, opts, sharing])

  const handleWhatsApp = useCallback(() => {
    if (!opts) return
    const href =
      waMode === 'customer' && opts.customerWhatsAppHref?.trim()
        ? opts.customerWhatsAppHref.trim()
        : opts.fallbackWhatsAppHref?.trim() ||
          buildWhatsAppShareLink(opts.fallbackWhatsAppText || opts.text || opts.filename)
    openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
  }, [opts, waMode])

  const brand = useMemo(() => opts?.brandLabel?.trim() || 'KC Jewellers', [opts?.brandLabel])
  const hasCustomerWa = !!opts?.customerWhatsAppHref?.trim()

  if (!payload || !opts) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-[#faf8f4]"
      role="dialog"
      aria-modal="true"
      aria-label={opts.title || opts.filename}
    >
      <header className="shrink-0 border-b border-[#e8e4df] bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-5xl items-start gap-2">
          <button
            type="button"
            onClick={close}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#e8e4df] bg-white text-[#1a1814] hover:bg-[#f7f4ef]"
            aria-label="Close PDF"
          >
            <X className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#1a1814]">{opts.title || opts.filename}</p>
            <p className="truncate text-xs text-[#1a1814]/55">{brand}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShareNative()}
              disabled={sharing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
            >
              {sharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Share
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#e8e4df] bg-white px-3 py-2 text-xs font-semibold text-[#1a1814] hover:bg-[#f7f4ef]"
            >
              <Download className="size-4" />
              Download
            </button>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/50">
            WhatsApp
            <select
              className="mt-1 block w-full rounded-xl border border-[#e8e4df] bg-white px-3 py-2.5 text-sm font-medium text-[#1a1814]"
              value={waMode}
              onChange={(e) => setWaMode(e.target.value as 'pick' | 'customer')}
            >
              <option value="pick">Pick contact</option>
              <option value="customer" disabled={!hasCustomerWa}>
                Customer number{hasCustomerWa ? '' : ' (none)'}
              </option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100 sm:w-auto"
          >
            <MessageCircle className="size-4" />
            WhatsApp
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden p-2 sm:p-4">
        {pdfUrl ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e4df] bg-white shadow-sm">
            <iframe src={pdfUrl} title={opts.filename} className="min-h-0 flex-1 w-full" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-emerald-700" />
          </div>
        )}
        <p className="mt-2 flex shrink-0 items-center gap-1.5 text-[11px] text-[#1a1814]/45">
          <FileText className="size-3.5" />
          {opts.filename}
        </p>
      </main>
    </div>
  )
}
