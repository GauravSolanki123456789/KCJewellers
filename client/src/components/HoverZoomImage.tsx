'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

const ZOOM_SCALE = 2.5
const TRANSITION_MS = 180

type HoverZoomImageProps = {
  children: React.ReactNode
  className?: string
  /** Allow touch-and-drag loupe zoom on coarse pointers (mobile). Default true. */
  touchZoom?: boolean
  /**
   * Let horizontal swipes reach a parent scroll gallery (PDP alternate photos).
   * Vertical drags still trigger finger-follow zoom.
   */
  swipeFriendly?: boolean
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
const SWIPE_AXIS_THRESHOLD_PX = 10

export default function HoverZoomImage({
  children,
  className = '',
  touchZoom = true,
  swipeFriendly = false,
}: HoverZoomImageProps) {
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)
  const [isTouching, setIsTouching] = useState(false)
  const [allowHoverZoom, setAllowHoverZoom] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const touchActiveRef = useRef(false)
  const touchGestureRef = useRef({ x: 0, y: 0, axis: null as 'x' | 'y' | null })

  useEffect(() => {
    const el = rootRef.current
    if (!el || !touchZoom) return

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !touchActiveRef.current) return
      if (!swipeFriendly || touchGestureRef.current.axis === 'y') {
        e.preventDefault()
      }
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [touchZoom, swipeFriendly])

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
      const t = e.touches[0]
      touchGestureRef.current = { x: t.clientX, y: t.clientY, axis: null }
      if (swipeFriendly) {
        touchActiveRef.current = false
        setIsTouching(false)
        return
      }
      touchActiveRef.current = true
      const rect = e.currentTarget.getBoundingClientRect()
      setOrigin(originFromPoint(t.clientX, t.clientY, rect))
      setIsTouching(true)
    },
    [touchZoom, swipeFriendly],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchZoom || e.touches.length !== 1) return
      const rect = e.currentTarget.getBoundingClientRect()
      const t = e.touches[0]

      if (swipeFriendly) {
        const dx = t.clientX - touchGestureRef.current.x
        const dy = t.clientY - touchGestureRef.current.y
        if (!touchGestureRef.current.axis) {
          if (
            Math.abs(dx) > SWIPE_AXIS_THRESHOLD_PX ||
            Math.abs(dy) > SWIPE_AXIS_THRESHOLD_PX
          ) {
            touchGestureRef.current.axis =
              Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
          }
        }
        if (touchGestureRef.current.axis === 'x') {
          touchActiveRef.current = false
          setIsTouching(false)
          return
        }
        if (!touchActiveRef.current) {
          touchActiveRef.current = true
          setIsTouching(true)
        }
        setOrigin(originFromPoint(t.clientX, t.clientY, rect))
        return
      }

      if (!touchActiveRef.current) return
      setOrigin(originFromPoint(t.clientX, t.clientY, rect))
    },
    [touchZoom, swipeFriendly],
  )

  const endTouch = useCallback(() => {
    touchActiveRef.current = false
    touchGestureRef.current.axis = null
    setIsTouching(false)
  }, [])

  const zoomed = (isHovering && allowHoverZoom) || isTouching

  const touchActionStyle =
    !touchZoom
      ? undefined
      : swipeFriendly
        ? isTouching
          ? 'none'
          : 'pan-x pan-y'
        : 'none'

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden ${
        touchZoom && (!swipeFriendly || isTouching) ? 'touch-none' : ''
      } ${className}`}
      style={{
        touchAction: touchActionStyle,
        overscrollBehavior: isTouching ? 'none' : undefined,
      }}
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
