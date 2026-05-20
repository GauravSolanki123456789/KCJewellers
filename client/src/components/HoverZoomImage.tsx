'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

const ZOOM_SCALE = 2.5
const TRANSITION_MS = 180

type HoverZoomImageProps = {
  children: React.ReactNode
  className?: string
  /** Allow touch-and-drag loupe zoom on coarse pointers (mobile). Default true. */
  touchZoom?: boolean
}

function originFromPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
}

/**
 * Cursor / finger-follow zoom for product imagery.
 * - Fine pointer: hover zoom (desktop).
 * - Touch: press and move on the image to zoom at your finger (mobile PDP).
 */
export default function HoverZoomImage({
  children,
  className = '',
  touchZoom = true,
}: HoverZoomImageProps) {
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  const [allowHoverZoom, setAllowHoverZoom] = useState(false)
  const touchActiveRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setAllowHoverZoom(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setOrigin(originFromPoint(e.clientX, e.clientY, rect))
  }, [])

  const handleMouseEnter = useCallback(() => setIsHovering(true), [])
  const handleMouseLeave = useCallback(() => setIsHovering(false), [])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchZoom || e.touches.length !== 1) return
      touchActiveRef.current = true
      const rect = e.currentTarget.getBoundingClientRect()
      const t = e.touches[0]
      setOrigin(originFromPoint(t.clientX, t.clientY, rect))
      setIsTouching(true)
    },
    [touchZoom],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchZoom || !touchActiveRef.current || e.touches.length !== 1) return
      const rect = e.currentTarget.getBoundingClientRect()
      const t = e.touches[0]
      setOrigin(originFromPoint(t.clientX, t.clientY, rect))
    },
    [touchZoom],
  )

  const endTouch = useCallback(() => {
    touchActiveRef.current = false
    setIsTouching(false)
  }, [])

  const zoomed = (isHovering && allowHoverZoom) || isTouching

  return (
    <div
      className={`relative h-full w-full overflow-hidden touch-none ${className}`}
      style={{ touchAction: touchZoom ? 'none' : undefined }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={endTouch}
      onTouchCancel={endTouch}
    >
      <div
        className="absolute inset-0"
        style={{
          transition: zoomed
            ? `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
            : `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
          transform: zoomed ? `scale(${ZOOM_SCALE})` : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
