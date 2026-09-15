'use client'

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Download, FileText, Loader2, MessageCircle, Printer, Share2, X } from 'lucide-react'
import {
  closePdfOverlay,
  getPdfOverlayPayload,
  subscribePdfOverlay,
} from '@/lib/pdf-viewer-overlay-store'
import { downloadPdfBlob, printPdfBlob, sharePdfFileNative } from '@/lib/pdf-share'
import { openExternalUrl, shouldUseSameTabWhatsAppNavigation } from '@/lib/cart-order-whatsapp'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'
import {
  fetchWhatsAppCloudStatus,
  normalizeErpMobile10,
  sendPdfViaWhatsAppCloud,
  whatsAppSetupHint,
  type WhatsAppCloudStatus,
} from '@/lib/erp-whatsapp-cloud'
import {
  customerWhatsAppHref,
  formatCustomerMobileDisplay,
} from '@/lib/catalog-inquiry-shared'

export default function PdfViewerOverlay() {
  const payload = useSyncExternalStore(subscribePdfOverlay, getPdfOverlayPayload, () => null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [waMsg, setWaMsg] = useState<string | null>(null)
  const [waConfigured, setWaConfigured] = useState(false)
  const [waStatus, setWaStatus] = useState<WhatsAppCloudStatus>({ configured: false })
  const [customerMobile, setCustomerMobile] = useState('')
  const [waMode, setWaMode] = useState<'pick' | 'customer'>('customer')

  const opts = payload?.opts
  const blob = payload?.blob

  useEffect(() => {
    if (!payload?.blob) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(
      new File([payload.blob], payload.opts.filename || 'invoice.pdf', {
        type: 'application/pdf',
      }),
    )
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [payload?.blob])

  useEffect(() => {
    if (!opts) return
    const initial =
      normalizeErpMobile10(opts.customerMobile) ||
      (() => {
        const href = opts.customerWhatsAppHref || ''
        const m = /(?:wa\.me\/|phone=)(\d+)/i.exec(href)
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

  useEffect(() => {
    if (!payload) return
    void fetchWhatsAppCloudStatus().then((s) => {
      setWaConfigured(s.configured)
      setWaStatus(s)
    })
  }, [payload])

  const close = useCallback(() => closePdfOverlay(), [])

  const waText = opts?.fallbackWhatsAppText || opts?.text || opts?.filename || ''

  const customerHref = useMemo(() => {
    const mob = normalizeErpMobile10(customerMobile)
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

  const handlePrint = useCallback(() => {
    if (!blob) return
    printPdfBlob(blob)
  }, [blob])

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
    if (!opts || !blob || waSending) return
    setWaMsg(null)
    const mob = normalizeErpMobile10(customerMobile)
    if (waMode === 'customer' && mob.length === 10) {
      if (!waConfigured) {
        setWaMsg(whatsAppSetupHint(waStatus))
        return
      }
      setWaSending(true)
      try {
        const result = await sendPdfViaWhatsAppCloud({
          blob,
          filename: opts.filename || 'document.pdf',
          mobile: mob,
          caption: waText,
        })
        setWaMsg(
          result.deliveryMode === 'template'
            ? 'PDF sent via approved WhatsApp template.'
            : 'PDF sent to customer on WhatsApp.',
        )
      } catch (e) {
        const err = e as { response?: { data?: { error?: string } }; message?: string }
        setWaMsg(err.response?.data?.error || err.message || 'WhatsApp send failed')
      } finally {
        setWaSending(false)
      }
      return
    }
    if (waMode === 'customer' && customerHref && !waConfigured) {
      setWaMsg(whatsAppSetupHint(waStatus))
      return
    }
    if (waMode === 'customer' && customerHref) {
      downloadPdfBlob(blob, opts.filename)
      openExternalUrl(customerHref, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
      return
    }
    const href =
      opts.fallbackWhatsAppHref?.trim() || buildWhatsAppShareLink(waText)
    openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
  }, [opts, blob, waMode, customerHref, waText, customerMobile, waConfigured, waSending, waStatus])

  if (!payload || !opts) return null

  const hasCustomerMobile = normalizeErpMobile10(customerMobile).length === 10

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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#e8e4df] bg-white px-3 py-2 text-xs font-semibold text-[#1a1814] hover:bg-[#f7f4ef]"
            >
              {sharing ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Share on this PC
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#e8e4df] bg-white px-3 py-2 text-xs font-semibold text-[#1a1814] hover:bg-[#f7f4ef]"
            >
              <Printer className="size-4" />
              Print
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#e8e4df] bg-white px-3 py-2 text-xs font-semibold text-[#1a1814] hover:bg-[#f7f4ef]"
            >
              <Download className="size-4" />
              Download {opts.filename ? opts.filename.replace(/\.pdf$/i, '') : 'PDF'}
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
              <option value="customer" disabled={!hasCustomerMobile}>
                {hasCustomerMobile ? customerLabel : 'Customer number (enter mobile)'}
              </option>
              <option value="pick">Pick a different contact</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void handleWhatsApp()}
            disabled={(waMode === 'customer' && !hasCustomerMobile) || waSending}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 sm:w-auto"
          >
            {waSending ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
            {waMode === 'customer'
              ? waConfigured
                ? 'Send PDF to customer'
                : 'Send to customer'
              : 'WhatsApp'}
          </button>
        </div>
        {waMsg ? (
          <p
            className={`mx-auto mt-2 max-w-5xl text-[11px] ${
              waMsg.includes('sent') ? 'text-emerald-800' : 'text-rose-700'
            }`}
          >
            {waMsg}
          </p>
        ) : !waConfigured && waMode === 'customer' && hasCustomerMobile ? (
          <p className="mx-auto mt-2 max-w-5xl text-[11px] text-rose-700">{whatsAppSetupHint(waStatus)}</p>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-hidden p-2 sm:p-4">
        {pdfUrl ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#e8e4df] bg-white shadow-sm">
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0`}
              title={opts.filename}
              className="min-h-0 flex-1 w-full"
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-emerald-700" />
          </div>
        )}
        <p className="mt-2 flex shrink-0 items-center gap-1.5 text-[11px] text-[#1a1814]/55">
          <FileText className="size-3.5" />
          Use <span className="font-semibold text-[#1a1814]">Download {opts.filename}</span> so the file is saved
          with this name (the browser PDF bar uses a random name).
        </p>
      </main>
    </div>
  )
}
