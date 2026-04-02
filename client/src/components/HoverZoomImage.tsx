'use client'

import React, { useCallback, useEffect, useState } from 'react'

const ZOOM_SCALE = 2.5
const TRANSITION_MS = 180

type HoverZoomImageProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Hover-to-zoom for fine pointers only (desktop). Touch / coarse pointers keep
 * the static image so mobile stays predictable and scroll-friendly.
 */
export default function HoverZoomImage({ children, className = '' }: HoverZoomImageProps) {
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)
  const [allowZoom, setAllowZoom] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const sync = () => setAllowZoom(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setOrigin({ x, y })
    },
    [],
  )

  const handleMouseEnter = useCallback(() => setIsHovering(true), [])
  const handleMouseLeave = useCallback(() => setIsHovering(false), [])

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute inset-0"
        style={{
          transition: `transform ${TRANSITION_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
          transform: isHovering && allowZoom
            ? `scale(${ZOOM_SCALE})`
            : 'scale(1)',
          transformOrigin: `${origin.x}% ${origin.y}%`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
