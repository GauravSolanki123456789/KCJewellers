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

/**
 * 1) Always save the PDF to the device (Downloads / Files).
 * 2) Then open the system share sheet when supported (e.g. WhatsApp on mobile).
 * 3) If share isn’t available, open WhatsApp with a short message (attach the file you saved).
 * If the user dismisses share, the file remains downloaded from step 1.
 */
export async function shareCatalogPdfBlob(blob: Blob, filename: string): Promise<void> {
  triggerDownload(blob, filename)

  const file = new File([blob], filename, { type: 'application/pdf' })
  const share = typeof navigator !== 'undefined' && navigator.share
  const canShareFiles =
    share &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [file],
        title: 'KC Jewellers catalogue',
        text: 'KC Jewellers — catalogue PDF',
      })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        /* user closed share — download already completed */
        return
      }
    }
    return
  }

  const msg = `KC Jewellers — catalogue PDF (${filename}). Attach the file you just saved from Downloads.`
  window.open(buildWhatsAppShareLink(msg), '_blank', 'noopener,noreferrer')
}
