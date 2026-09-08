/** In-page PDF viewer — blob kept in memory (same tab, no sessionStorage cross-tab issues). */

import type { OpenPdfViewerOptions } from '@/lib/pdf-share'

export type PdfOverlayPayload = {
  blob: Blob
  opts: OpenPdfViewerOptions
}

let current: PdfOverlayPayload | null = null
const listeners = new Set<() => void>()

export function getPdfOverlayPayload(): PdfOverlayPayload | null {
  return current
}

export function openPdfOverlay(blob: Blob, opts: OpenPdfViewerOptions): void {
  current = { blob, opts }
  listeners.forEach((fn) => fn())
}

export function closePdfOverlay(): void {
  current = null
  listeners.forEach((fn) => fn())
}

export function subscribePdfOverlay(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
