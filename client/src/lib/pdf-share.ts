import { buildWhatsAppShareLink } from '@/lib/whatsapp'

function openWhatsAppFallback(text: string, explicitHref?: string | null) {
  const href =
    typeof explicitHref === 'string' && explicitHref.trim().length > 0
      ? explicitHref.trim()
      : buildWhatsAppShareLink(text)
  window.open(href, '_blank', 'noopener,noreferrer')
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

/** Open PDF in a new tab — iOS Safari “Share ↗ → WhatsApp” flow. */
export function openPdfBlobInViewer(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    window.location.assign(url)
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

export type SharePdfBlobOptions = {
  title: string
  text: string
  fallbackWhatsAppText: string
  fallbackWhatsAppHref?: string | null
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
  if (shouldPresentPdfShareSheet()) {
    const result = await sharePdfFileNative(blob, filename, opts)
    if (result === 'shared' || result === 'cancelled') return
    openPdfBlobInViewer(blob)
    return
  }

  triggerDownload(blob, filename)

  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 200)
  })

  const result = await sharePdfFileNative(blob, filename, opts)
  if (result === 'shared' || result === 'cancelled') return

  openWhatsAppFallback(opts.fallbackWhatsAppText, opts.fallbackWhatsAppHref)
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
  brandLabel?: string
}
