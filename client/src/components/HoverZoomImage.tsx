'use client'

import React, { useCallback, useState } from 'react'

const ZOOM_SCALE = 2.5
const TRANSITION_MS = 180

type HoverZoomImageProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Wraps an image (e.g. Next.js Image) with a premium hover-to-zoom magnifier effect.
 * On hover: scales to 2.5x and pans based on cursor position (transform-origin tracks X/Y %).
 */
export default function HoverZoomImage({ children, className = '' }: HoverZoomImageProps) {
  const [origin, setOrigin] = useState({ x: 50, y: 50 })
  const [isHovering, setIsHovering] = useState(false)

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
          transform: isHovering
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
