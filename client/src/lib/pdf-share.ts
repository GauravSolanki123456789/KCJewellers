import { buildWhatsAppShareLink } from '@/lib/whatsapp'

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
    URL.revokeObjectURL(url)
  }
}

/** Save a PDF blob to the user’s device (desktop save-as / mobile Downloads). */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  triggerDownload(blob, filename)
}

export type SharePdfBlobOptions = {
  title: string
  text: string
  /** If Web Share API cannot send the file, open WhatsApp with this message (user attaches the saved file). */
  fallbackWhatsAppText: string
}

/**
 * 1) Save the PDF to the device.
 * 2) After a short delay (lets mobile browsers finish the download), open the system share sheet
 *    with the PDF so the user can pick WhatsApp. Some Android builds report `canShare` false even
 *    when sharing works — we still call `navigator.share({ files })` and rely on try/catch.
 * 3) If file sharing isn’t supported or fails, open WhatsApp with a short text (user attaches the file).
 */
export async function sharePdfBlob(blob: Blob, filename: string, opts: SharePdfBlobOptions): Promise<void> {
  triggerDownload(blob, filename)

  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 200)
  })

  const file = new File([blob], filename, { type: 'application/pdf' })

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const payload: ShareData = {
      files: [file],
      title: opts.title,
      text: opts.text,
    }

    try {
      if (typeof navigator.canShare === 'function' && !navigator.canShare(payload)) {
        /* still try — mobile Chrome/WebView sometimes misreports */
      }
      await navigator.share(payload)
      return
    } catch (e) {
      const err = e as Error
      if (err?.name === 'AbortError') {
        return
      }
    }
  }

  window.open(buildWhatsAppShareLink(opts.fallbackWhatsAppText), '_blank', 'noopener,noreferrer')
}

export async function shareCatalogPdfBlob(blob: Blob, filename: string): Promise<void> {
  return sharePdfBlob(blob, filename, {
    title: 'KC Jewellers catalogue',
    text: 'KC Jewellers — catalogue PDF',
    fallbackWhatsAppText: `KC Jewellers — catalogue PDF (${filename}). Attach the file you just saved.`,
  })
}
