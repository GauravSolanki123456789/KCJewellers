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
import {
  customerWhatsAppHref,
  formatCustomerMobileDisplay,
} from '@/lib/catalog-inquiry-shared'

function normalizeMobileDigits(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(-10)
}

export default function PdfViewerOverlay() {
  const payload = useSyncExternalStore(subscribePdfOverlay, getPdfOverlayPayload, () => null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [customerMobile, setCustomerMobile] = useState('')
  const [waMode, setWaMode] = useState<'pick' | 'customer'>('pick')

  const opts = payload?.opts
  const blob = payload?.blob

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
    if (!opts) return
    const initial =
      normalizeMobileDigits(opts.customerMobile) ||
      (() => {
        const href = opts.customerWhatsAppHref || ''
        const m = /wa\.me\/(\d+)/i.exec(href)
        if (m) return m[1].slice(-10)
        return ''
      })()
    setCustomerMobile(initial)
    setWaMode(initial.length === 10 ? 'customer' : 'pick')
  }, [opts])

  useEffect(() => {
    if (!payload) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [payload])

  const close = useCallback(() => closePdfOverlay(), [])

  const waText = opts?.fallbackWhatsAppText || opts?.text || opts?.filename || ''

  const customerHref = useMemo(() => {
    const mob = normalizeMobileDigits(customerMobile)
    return mob.length === 10 ? customerWhatsAppHref(mob, waText) : null
  }, [customerMobile, waText])

  const customerLabel = useMemo(() => {
    const display = formatCustomerMobileDisplay(customerMobile)
    return display ? `Customer — ${display}` : 'Customer number (enter below)'
  }, [customerMobile])

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

  const handleWhatsApp = useCallback(async () => {
    if (!opts || !blob) return
    if (waMode === 'customer' && customerHref) {
      const shared = await sharePdfFileNative(blob, opts.filename, {
        title: opts.title || opts.filename,
        text: waText,
      })
      if (shared === 'shared') return
      openExternalUrl(customerHref, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
      return
    }
    const href =
      opts.fallbackWhatsAppHref?.trim() || buildWhatsAppShareLink(waText)
    openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
  }, [opts, blob, waMode, customerHref, waText])

  if (!payload || !opts) return null

  const hasCustomerMobile = normalizeMobileDigits(customerMobile).length === 10

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
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShareNative()}
              disabled={sharing}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600"
            >
              {sharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Share PDF
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

        <div className="mx-auto mt-3 grid max-w-5xl gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/50">
            Customer mobile
            <input
              type="tel"
              inputMode="numeric"
              className="mt-1 block w-full rounded-xl border border-[#e8e4df] bg-white px-3 py-2.5 text-sm font-medium text-[#1a1814]"
              placeholder="10-digit for WhatsApp"
              value={customerMobile}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                setCustomerMobile(v)
                if (v.length === 10) setWaMode('customer')
              }}
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/50">
            WhatsApp
            <select
              className="mt-1 block w-full min-w-[160px] rounded-xl border border-[#e8e4df] bg-white px-3 py-2.5 text-sm font-medium text-[#1a1814]"
              value={waMode}
              onChange={(e) => setWaMode(e.target.value as 'pick' | 'customer')}
            >
              <option value="pick">Pick contact</option>
              <option value="customer" disabled={!hasCustomerMobile}>
                {hasCustomerMobile ? customerLabel : 'Customer number (enter mobile)'}
              </option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleWhatsApp()}
            disabled={waMode === 'customer' && !hasCustomerMobile}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100 sm:w-auto"
          >
            <MessageCircle className="size-4" />
            {waMode === 'customer' ? 'Send to customer' : 'WhatsApp'}
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
