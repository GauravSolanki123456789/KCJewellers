/** Browser-only PDF.js loader (legacy build for broad device support). */

let workerReady = false

export async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined' && !workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
    workerReady = true
  }
  return pdfjs
}
