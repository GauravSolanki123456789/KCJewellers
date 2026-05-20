'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type SharedCatalogLightboxSlide = {
  primarySrc: string
  secondarySrc?: string | null
  title: string
  subtitle?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  slides: SharedCatalogLightboxSlide[]
  initialIndex?: number
}

export default function SharedCatalogImageLightbox({
  open,
  onOpenChange,
  slides,
  initialIndex = 0,
}: Props) {
  const [index, setIndex] = useState(initialIndex)
  const [showAlt, setShowAlt] = useState(false)

  useEffect(() => {
    if (open) {
      setIndex(initialIndex)
      setShowAlt(false)
    }
  }, [open, initialIndex])

  const step = useCallback(
    (delta: number) => {
      if (slides.length <= 1) return
      setIndex((i) => (i + delta + slides.length) % slides.length)
      setShowAlt(false)
    },
    [slides.length],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step, onOpenChange])

  if (slides.length === 0) return null

  const current = slides[index] ?? slides[0]
  const multi = slides.length > 1
  const hasAlt = !!current.secondarySrc?.trim()
  const activeSrc = showAlt && hasAlt ? current.secondarySrc!.trim() : current.primarySrc

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(96dvh,880px)] gap-0 overflow-hidden border-slate-700/80 bg-slate-950 p-0 sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
            <DialogTitle className="truncate text-sm font-semibold text-slate-100">
              {current.title}
            </DialogTitle>
            {current.subtitle ? (
              <DialogDescription className="truncate text-xs text-slate-400">
                {current.subtitle}
              </DialogDescription>
            ) : null}
            {multi ? (
              <p className="text-[11px] tabular-nums text-slate-500">
                {index + 1} of {slides.length}
              </p>
            ) : null}
          </DialogHeader>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close image viewer"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="relative mx-auto flex h-[min(62dvh,520px)] w-full items-center justify-center bg-slate-900/50 px-12 sm:px-14">
          {multi ? (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-2 top-1/2 z-10 flex size-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-slate-600 bg-slate-950/90 text-slate-200 shadow-lg backdrop-blur-sm transition hover:border-amber-500/40 hover:text-white"
                aria-label="Previous item"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-2 top-1/2 z-10 flex size-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-slate-600 bg-slate-950/90 text-slate-200 shadow-lg backdrop-blur-sm transition hover:border-amber-500/40 hover:text-white"
                aria-label="Next item"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          ) : null}

          <div className="relative h-full w-full max-w-[min(100%,22rem)]">
            <Image
              key={activeSrc}
              src={activeSrc}
              alt={current.title}
              fill
              className="object-contain select-none"
              sizes="(max-width: 640px) 88vw, 420px"
              unoptimized
              draggable={false}
              priority
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
          {hasAlt ? (
            <button
              type="button"
              onClick={() => setShowAlt((v) => !v)}
              className={cn(
                'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition',
                showAlt
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500',
              )}
            >
              <ZoomIn className="size-3.5 shrink-0" aria-hidden />
              {showAlt ? 'Primary view' : 'Alternate view'}
            </button>
          ) : (
            <span className="text-[11px] text-slate-500">Pinch or double-tap to zoom in browser</span>
          )}
          <p className="text-[11px] text-slate-500 sm:text-right">
            Swipe or use arrows to browse items
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Small tap target on product cards — opens lightbox without toggling selection. */
export function SharedCatalogZoomHint({
  onZoom,
  className,
}: {
  onZoom: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onZoom()
      }}
      className={cn(
        'absolute bottom-2 right-2 z-30 flex size-9 touch-manipulation items-center justify-center rounded-full border border-slate-600/80 bg-slate-950/75 text-slate-100 shadow-md backdrop-blur-sm transition hover:border-amber-500/50 hover:bg-slate-900 active:scale-95',
        className,
      )}
      aria-label="View larger image"
    >
      <ZoomIn className="size-4" aria-hidden />
    </button>
  )
}
