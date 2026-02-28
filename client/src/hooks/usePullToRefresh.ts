'use client'

import { useCallback, useRef, useState } from 'react'

const PULL_THRESHOLD = 80
const MAX_PULL = 120

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pullY, setPullY] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return
    const scrollTop = window.scrollY ?? document.documentElement.scrollTop
    if (scrollTop <= 0) {
      startY.current = e.touches[0].clientY
    }
  }, [isRefreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return
    const scrollTop = window.scrollY ?? document.documentElement.scrollTop
    if (scrollTop > 0) return
    const y = e.touches[0].clientY
    const diff = y - startY.current
    if (diff > 0) {
      const damped = Math.min(diff * 0.5, MAX_PULL)
      setPullY(damped)
    }
  }, [isRefreshing])

  const handleTouchEnd = useCallback(async () => {
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true)
      setPullY(0)
      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
      }
    } else {
      setPullY(0)
    }
  }, [pullY, isRefreshing, onRefresh])

  return {
    pullY,
    isRefreshing,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    containerRef,
  }
}
