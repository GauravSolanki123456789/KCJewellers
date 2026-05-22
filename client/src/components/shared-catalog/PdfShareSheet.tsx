'use client'

import { useCallback, useState } from 'react'
import { FileText, Loader2, MessageCircle, Share2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  downloadPdfBlob,
  isIosDevice,
  openPdfBlobInViewer,
  sharePdfFileNative,
  type PdfShareSheetPayload,
} from '@/lib/pdf-share'
import { buildWhatsAppShareLink } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: PdfShareSheetPayload | null
}

export default function PdfShareSheet({ open, onOpenChange, payload }: Props) {
  const [sharing, setSharing] = useState(false)

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const handleSharePdf = useCallback(async () => {
    if (!payload || sharing) return
    setSharing(true)
    try {
      const result = await sharePdfFileNative(payload.blob, payload.filename, {
        title: payload.title,
        text: payload.text,
      })
      if (result === 'shared') close()
      else if (result === 'unsupported' || result === 'failed') openPdfBlobInViewer(payload.blob)
    } finally {
      setSharing(false)
    }
  }, [payload, sharing, close])

  const handleOpenPdf = useCallback(() => {
    if (!payload) return
    openPdfBlobInViewer(payload.blob)
    close()
  }, [payload, close])

  const handleDownload = useCallback(() => {
    if (!payload) return
    downloadPdfBlob(payload.blob, payload.filename)
    close()
  }, [payload, close])

  const handleWhatsAppText = useCallback(() => {
    if (!payload) return
    const href =
      payload.fallbackWhatsAppHref?.trim() ||
      buildWhatsAppShareLink(payload.fallbackWhatsAppText)
    window.open(href, '_blank', 'noopener,noreferrer')
    close()
  }, [payload, close])

  const brand = payload?.brandLabel?.trim() || 'KC Jewellers'
  const ios = isIosDevice()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden border-neutral-200 bg-white p-0 sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4">
          <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
            <DialogTitle className="text-base font-semibold text-neutral-900">
              PDF ready
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-neutral-600">
              {ios
                ? `Tap Share PDF, then choose WhatsApp to send your shortlist to ${brand}.`
                : `Share your shortlist PDF with ${brand} on WhatsApp or save it to your device.`}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={close}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition hover:bg-neutral-50"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-2.5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-1 sm:pb-4">
          <button
            type="button"
            disabled={!payload || sharing}
            onClick={handleSharePdf}
            className={cn(
              'flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.99]',
              sharing ? 'bg-neutral-400' : 'bg-emerald-600 hover:bg-emerald-500',
            )}
          >
            {sharing ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Share2 className="size-5 shrink-0" aria-hidden />
            )}
            {sharing ? 'Opening share…' : 'Share PDF — WhatsApp, Files…'}
          </button>

          <button
            type="button"
            disabled={!payload}
            onClick={handleOpenPdf}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 active:scale-[0.99]"
          >
            <FileText className="size-5 shrink-0" aria-hidden />
            Open PDF
          </button>

          <button
            type="button"
            disabled={!payload}
            onClick={handleWhatsAppText}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 active:scale-[0.99]"
          >
            <MessageCircle className="size-5 shrink-0 text-emerald-600" aria-hidden />
            WhatsApp (text only)
          </button>

          {!ios ? (
            <button
              type="button"
              disabled={!payload}
              onClick={handleDownload}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              Save to device
            </button>
          ) : null}
        </div>

        {payload ? (
          <p className="border-t border-neutral-100 px-4 py-3 text-center text-[11px] leading-relaxed text-neutral-500">
            {ios
              ? 'If WhatsApp is not listed, tap Open PDF → Share ↗ at the bottom of Safari → WhatsApp.'
              : 'Tip: Share PDF attaches the catalogue; WhatsApp (text) sends your picks without the file.'}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
