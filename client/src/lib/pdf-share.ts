import { buildWhatsAppShareLink } from '@/lib/whatsapp'

/**
 * Prefer system share (mobile: often includes WhatsApp with PDF attached).
 * Otherwise download the file and open WhatsApp with instructions to attach it.
 */
export async function shareCatalogPdfBlob(blob: Blob, filename: string): Promise<void> {
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
      return
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
    }
  }

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

  const msg = `KC Jewellers — catalogue PDF (${filename}). Attach the file from your Downloads folder (or use Share on your phone).`
  window.open(buildWhatsAppShareLink(msg), '_blank', 'noopener,noreferrer')
}
