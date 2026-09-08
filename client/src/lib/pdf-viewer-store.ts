/** Session-scoped PDF blob handoff for /pdf-viewer tab. */

export type StoredPdfViewerPayload = {
  blobBase64: string
  filename: string
  title: string
  text: string
  fallbackWhatsAppText: string
  /** wa.me link — pick contact / current flow */
  fallbackWhatsAppHref?: string | null
  /** wa.me link — open chat with customer number */
  customerWhatsAppHref?: string | null
  brandLabel?: string
}

const PREFIX = 'kc-pdf-viewer:'

export function storePdfForViewer(payload: StoredPdfViewerPayload): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  sessionStorage.setItem(`${PREFIX}${id}`, JSON.stringify(payload))
  return id
}

export function loadPdfFromViewerStore(id: string): StoredPdfViewerPayload | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`)
    if (!raw) return null
    return JSON.parse(raw) as StoredPdfViewerPayload
  } catch {
    return null
  }
}

export function clearPdfViewerStore(id: string): void {
  sessionStorage.removeItem(`${PREFIX}${id}`)
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function base64ToBlob(base64: string, mime = 'application/pdf'): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
