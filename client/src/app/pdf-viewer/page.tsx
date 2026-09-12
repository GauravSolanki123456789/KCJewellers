'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileText, Loader2, MessageCircle, Printer, Share2 } from 'lucide-react'
import {
  base64ToBlob,
  clearPdfViewerStore,
  loadPdfFromViewerStore,
  type StoredPdfViewerPayload,
} from '@/lib/pdf-viewer-store'
import { downloadPdfBlob, printPdfBlob, sharePdfFileNative } from '@/lib/pdf-share'
import { openExternalUrl, shouldUseSameTabWhatsAppNavigation } from '@/lib/cart-order-whatsapp'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'

function PdfViewerInner() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''
  const [payload, setPayload] = useState<StoredPdfViewerPayload | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [waMode, setWaMode] = useState<'pick' | 'customer'>('pick')

  useEffect(() => {
    if (!id) return
    const stored = loadPdfFromViewerStore(id)
    if (!stored) return
    setPayload(stored)
    const blob = base64ToBlob(stored.blobBase64)
    const url = URL.createObjectURL(blob)
    setPdfUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      clearPdfViewerStore(id)
    }
  }, [id])

  const blob = useMemo(() => {
    if (!payload) return null
    return base64ToBlob(payload.blobBase64)
  }, [payload])

  const handleDownload = useCallback(() => {
    if (!blob || !payload) return
    downloadPdfBlob(blob, payload.filename)
  }, [blob, payload])

  const handlePrint = useCallback(() => {
    if (!blob) return
    printPdfBlob(blob)
  }, [blob])

  const handleShareNative = useCallback(async () => {
    if (!blob || !payload || sharing) return
    setSharing(true)
    try {
      await sharePdfFileNative(blob, payload.filename, {
        title: payload.title,
        text: payload.text,
      })
    } finally {
      setSharing(false)
    }
  }, [blob, payload, sharing])

  const handleWhatsApp = useCallback(() => {
    if (!payload) return
    const href =
      waMode === 'customer' && payload.customerWhatsAppHref?.trim()
        ? payload.customerWhatsAppHref.trim()
        : payload.fallbackWhatsAppHref?.trim() ||
          buildWhatsAppShareLink(payload.fallbackWhatsAppText)
    openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
  }, [payload, waMode])

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f4] p-6 text-center">
        <p className="text-sm text-neutral-700">Missing PDF id.</p>
      </div>
    )
  }

  if (!payload || !pdfUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#faf8f4] p-6">
        <Loader2 className="size-8 animate-spin text-emerald-700" />
        <p className="text-sm text-neutral-700">Loading PDF…</p>
        <p className="text-xs text-neutral-500">If this persists, regenerate the PDF from ERP.</p>
      </div>
    )
  }

  const hasCustomerWa = !!payload.customerWhatsAppHref?.trim()

  return (
    <div className="flex min-h-screen flex-col bg-[#faf8f4]">
      <header className="sticky top-0 z-10 border-b border-[#e8e4df] bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1a1814]">{payload.title || payload.filename}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              Download
            </button>
          </div>
        </div>

        <div className="mx-auto mt-3 flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-[10px] font-bold uppercase tracking-wide text-[#1a1814]/50">
            WhatsApp share mode
            <select
              className="mt-1 block w-full rounded-xl border border-[#e8e4df] bg-white px-3 py-2.5 text-sm font-medium text-[#1a1814]"
              value={waMode}
              onChange={(e) => setWaMode(e.target.value as 'pick' | 'customer')}
            >
              <option value="pick">Pick contact / share sheet (current)</option>
              <option value="customer" disabled={!hasCustomerWa}>
                Send to customer number{hasCustomerWa ? '' : ' (no customer mobile)'}
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
        <p className="mx-auto mt-2 max-w-5xl text-[11px] leading-relaxed text-[#1a1814]/50">
          Tip: Use <strong>Share PDF</strong> to attach the file on mobile. WhatsApp text opens a chat — attach the PDF
          from Downloads or use Share PDF.
        </p>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-2 sm:p-4">
        <div className="overflow-hidden rounded-xl border border-[#e8e4df] bg-white shadow-sm">
          <iframe
            src={pdfUrl}
            title={payload.filename}
            className="h-[calc(100vh-220px)] min-h-[360px] w-full"
          />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#1a1814]/45">
          <FileText className="size-3.5" />
          {payload.filename}
        </p>
      </main>
    </div>
  )
}

export default function PdfViewerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#faf8f4]">
          <Loader2 className="size-8 animate-spin text-emerald-700" />
        </div>
      }
    >
      <PdfViewerInner />
    </Suspense>
  )
}
