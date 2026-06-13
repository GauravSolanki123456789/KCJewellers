'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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

const LOUPE_SCALE = 2.75
const MAX_PINCH_SCALE = 4

function originFromPoint(clientX: number, clientY: number, rect: DOMRect) {
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
}

function pinchDistance(touches: React.TouchList | TouchList) {
  if (touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

function SharedCatalogZoomViewport({
  src,
  alt,
}: {
  src: string
  alt: string
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [loupeActive, setLoupeActive] = useState(false)
  const [pinchScale, setPinchScale] = useState(1)
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null)
  const allowHoverRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => {
      allowHoverRef.current = mq.matches
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const updateOrigin = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current
    if (!el) return
    setOrigin(originFromPoint(clientX, clientY, el.getBoundingClientRect()))
  }, [])

  const resetPinch = useCallback(() => {
    pinchStartRef.current = null
    setPinchScale(1)
  }, [])

  const effectiveScale = (loupeActive ? LOUPE_SCALE : 1) * pinchScale

  return (
    <div
      ref={surfaceRef}
      className="relative h-full w-full max-w-[min(100%,22rem)] touch-none overflow-hidden"
      style={{ touchAction: 'none' }}
      onMouseMove={(e) => {
        if (!allowHoverRef.current) return
        updateOrigin(e.clientX, e.clientY)
      }}
      onMouseEnter={() => {
        if (allowHoverRef.current) setLoupeActive(true)
      }}
      onMouseLeave={() => {
        if (allowHoverRef.current) setLoupeActive(false)
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) {
          pinchStartRef.current = { dist: pinchDistance(e.touches), scale: pinchScale }
          setLoupeActive(false)
          return
        }
        if (e.touches.length === 1) {
          updateOrigin(e.touches[0].clientX, e.touches[0].clientY)
          setLoupeActive(true)
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 2 && pinchStartRef.current) {
          const dist = pinchDistance(e.touches)
          if (dist > 0 && pinchStartRef.current.dist > 0) {
            const next =
              pinchStartRef.current.scale * (dist / pinchStartRef.current.dist)
            setPinchScale(Math.max(1, Math.min(MAX_PINCH_SCALE, next)))
          }
          return
        }
        if (e.touches.length === 1 && loupeActive) {
          updateOrigin(e.touches[0].clientX, e.touches[0].clientY)
        }
      }}
      onTouchEnd={(e) => {
        if (e.touches.length === 0) {
          setLoupeActive(false)
          resetPinch()
        } else if (e.touches.length === 1) {
          pinchStartRef.current = null
          setPinchScale(1)
          updateOrigin(e.touches[0].clientX, e.touches[0].clientY)
          setLoupeActive(true)
        }
      }}
      onTouchCancel={() => {
        setLoupeActive(false)
        resetPinch()
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transform: `scale(${effectiveScale})`,
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: loupeActive || pinchScale > 1 ? 'transform 120ms ease-out' : 'transform 180ms ease-out',
        }}
      >
        <Image
          key={src}
          src={src}
          alt={alt}
          fill
          className="object-contain select-none"
          sizes="(max-width: 640px) 88vw, 420px"
          unoptimized
          draggable={false}
          priority
        />
      </div>
    </div>
  )
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

          <SharedCatalogZoomViewport src={activeSrc} alt={current.title} />
        </div>

        {hasAlt ? (
          <div className="border-t border-slate-800 px-4 py-3">
            <button
              type="button"
              onClick={() => setShowAlt((v) => !v)}
              className={cn(
                'inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition sm:w-auto',
                showAlt
                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                  : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500',
              )}
            >
              <ZoomIn className="size-3.5 shrink-0" aria-hidden />
              {showAlt ? 'Primary view' : 'Alternate view'}
            </button>
          </div>
        ) : null}
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
      data-no-card-toggle
      onClick={(e) => {
        e.stopPropagation()
        onZoom()
      }}
      className={cn(
        'absolute bottom-2 right-2 z-30 flex size-9 touch-manipulation items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-900/85 text-white shadow-md backdrop-blur-sm transition hover:border-amber-500/50 hover:bg-neutral-900 active:scale-95',
        className,
      )}
      aria-label="View larger image"
    >
      <ZoomIn className="size-4" aria-hidden />
    </button>
  )
}
