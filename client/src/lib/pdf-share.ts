import { buildWhatsAppShareLink } from '@/lib/whatsapp'
import { openExternalUrl, shouldUseSameTabWhatsAppNavigation } from '@/lib/cart-order-whatsapp'
import { openPdfOverlay } from '@/lib/pdf-viewer-overlay-store'

function openWhatsAppFallback(text: string, explicitHref?: string | null) {
  const href =
    typeof explicitHref === 'string' && explicitHref.trim().length > 0
      ? explicitHref.trim()
      : buildWhatsAppShareLink(text)
  openExternalUrl(href, { preferNewTab: !shouldUseSameTabWhatsAppNavigation() })
}

/** iPhone / iPad (incl. iPadOS desktop UA). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || '',
  )
}

/**
 * iOS (and most mobile) lose the user-activation token while a PDF is generating.
 * Show an action sheet so Share runs on a fresh tap.
 */
export function shouldPresentPdfShareSheet(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIosDevice() || (isMobileBrowser() && typeof navigator.share === 'function')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}

/** Save a PDF blob to the user’s device (desktop save-as / Android Downloads). */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename)
}

/** Open PDF in a hidden iframe and trigger the browser print dialog. */
export function printPdfBlob(blob: Blob): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.src = url
  document.body.appendChild(iframe)
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch {
      openPdfBlobInViewer(blob)
    }
  }
  setTimeout(() => {
    iframe.remove()
    URL.revokeObjectURL(url)
  }, 120_000)
}

export type OpenPdfViewerOptions = {
  filename: string
  title?: string
  text?: string
  fallbackWhatsAppText?: string
  fallbackWhatsAppHref?: string | null
  customerWhatsAppHref?: string | null
  /** 10-digit customer mobile — shown in viewer and used for WhatsApp send */
  customerMobile?: string | null
  brandLabel?: string
}

/** Open PDF in an in-page overlay (same tab — no popup / sessionStorage issues). */
export async function openPdfBlobInViewer(blob: Blob, opts?: OpenPdfViewerOptions): Promise<void> {
  if (typeof window === 'undefined') return

  if (opts?.filename) {
    openPdfOverlay(blob, {
      filename: opts.filename,
      title: opts.title || opts.filename,
      text: opts.text || opts.filename,
      fallbackWhatsAppText: opts.fallbackWhatsAppText || opts.text || opts.filename,
      fallbackWhatsAppHref: opts.fallbackWhatsAppHref ?? null,
      customerWhatsAppHref: opts.customerWhatsAppHref ?? null,
      customerMobile: opts.customerMobile ?? null,
      brandLabel: opts.brandLabel,
    })
    return
  }

  const url = URL.createObjectURL(blob)
  openExternalUrl(url, { preferNewTab: false })
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/** Default PDF action — open viewer tab instead of downloading. */
export async function presentPdfBlob(blob: Blob, filename: string, opts?: Omit<OpenPdfViewerOptions, 'filename'>) {
  await openPdfBlobInViewer(blob, { filename, ...opts })
}

export type SharePdfBlobOptions = {
  title: string
  text: string
  fallbackWhatsAppText: string
  fallbackWhatsAppHref?: string | null
  customerWhatsAppHref?: string | null
  customerMobile?: string | null
}

export type SharePdfNativeResult = 'shared' | 'cancelled' | 'unsupported' | 'failed'

/** System share sheet with PDF file — must run inside a user tap (iOS requirement). */
export async function sharePdfFileNative(
  blob: Blob,
  filename: string,
  opts: Pick<SharePdfBlobOptions, 'title' | 'text'>,
): Promise<SharePdfNativeResult> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported'
  }

  const file = new File([blob], filename, { type: 'application/pdf' })
  const payload: ShareData = {
    files: [file],
    title: opts.title,
    text: opts.text,
  }

  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
      return 'unsupported'
    }
    await navigator.share(payload)
    return 'shared'
  } catch (e) {
    const err = e as Error
    if (err?.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

/**
 * Desktop / Android auto-flow: download then try share.
 * On iOS, prefer {@link shouldPresentPdfShareSheet} + {@link sharePdfFileNative} on a second tap.
 */
export async function sharePdfBlob(blob: Blob, filename: string, opts: SharePdfBlobOptions): Promise<void> {
  await openPdfBlobInViewer(blob, {
    filename,
    title: opts.title,
    text: opts.text,
    fallbackWhatsAppText: opts.fallbackWhatsAppText,
    fallbackWhatsAppHref: opts.fallbackWhatsAppHref,
    customerWhatsAppHref: opts.customerWhatsAppHref,
    customerMobile: opts.customerMobile,
  })
}

export async function shareCatalogPdfBlob(blob: Blob, filename: string): Promise<void> {
  return sharePdfBlob(blob, filename, {
    title: 'KC Jewellers catalogue',
    text: 'KC Jewellers — catalogue PDF',
    fallbackWhatsAppText: `KC Jewellers — catalogue PDF (${filename}). Attach the file you just saved.`,
  })
}

export type PdfShareSheetPayload = {
  blob: Blob
  filename: string
  title: string
  text: string
  fallbackWhatsAppText: string
  fallbackWhatsAppHref?: string | null
  customerWhatsAppHref?: string | null
  customerMobile?: string | null
  brandLabel?: string
}
