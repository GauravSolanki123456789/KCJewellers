'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getPdfjs } from '@/lib/pdfjs-client'

type Props = {
  blob: Blob
  title?: string
  className?: string
}

/**
 * Renders a PDF blob with PDF.js (canvas). Works on devices where blob: iframes
 * only show a file placeholder (common on Windows Edge / disabled PDF plug-ins).
 */
export function PdfBlobCanvasViewer({ blob, title, className }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesHostRef = useRef<HTMLDivElement>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setLayoutWidth(el.clientWidth || 0)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const host = pagesHostRef.current
    if (!host || layoutWidth < 40) return

    const run = async () => {
      setStatus('loading')
      setErrorMsg(null)
      host.replaceChildren()

      try {
        const pdfjs = await getPdfjs()
        const data = await blob.arrayBuffer()
        const doc = await pdfjs.getDocument({ data }).promise
        if (cancelled) return

        const maxWidth = Math.max(280, layoutWidth - 24)
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = Math.min(2.25, maxWidth / base.width)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = 'max-w-full rounded-sm border border-[#e8e4df]/80 bg-white shadow-sm'
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', `${title || 'Document'} — page ${pageNum}`)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          if (cancelled) return
          const wrap = document.createElement('div')
          wrap.className = 'flex justify-center py-2 first:pt-3 last:pb-4'
          wrap.appendChild(canvas)
          host.appendChild(wrap)
        }
        if (!cancelled) setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErrorMsg(e instanceof Error ? e.message : 'Could not display PDF')
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [blob, layoutWidth, title])

  return (
    <div ref={scrollRef} className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className || ''}`}>
      {status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-emerald-700" aria-hidden />
          <span className="sr-only">Loading PDF</span>
        </div>
      ) : null}
      <div
        ref={pagesHostRef}
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f3f0eb] ${
          status === 'loading' ? 'hidden' : ''
        }`}
      />
      {status === 'error' ? (
        <p className="px-4 py-6 text-center text-sm text-rose-700">
          {errorMsg || 'Could not display PDF.'} Use Download or Print above.
        </p>
      ) : null}
    </div>
  )
}
