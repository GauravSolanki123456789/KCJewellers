/** Client-side OCR for tax invoice template upload (image or PDF first page). */

export type OcrProgress = { status: string; progress: number }

async function loadTesseract() {
  const { createWorker } = await import('tesseract.js')
  return createWorker
}

export async function fileToImageDataUrl(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (file.type.startsWith('image/')) {
    return readFileAsDataUrl(file)
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    onProgress?.('Converting PDF page 1 to image…')
    return pdfFirstPageToDataUrl(file)
  }
  throw new Error('Upload a JPG, PNG, or PDF invoice sample.')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`
  }
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas.toDataURL('image/png')
}

export async function runOcrOnImage(
  dataUrl: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  const createWorker = await loadTesseract()
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ status: 'Reading text…', progress: Math.round((m.progress || 0) * 100) })
      } else {
        onProgress?.({ status: m.status, progress: Math.round((m.progress || 0) * 100) })
      }
    },
  })
  try {
    const { data } = await worker.recognize(dataUrl)
    return data.text || ''
  } finally {
    await worker.terminate()
  }
}
