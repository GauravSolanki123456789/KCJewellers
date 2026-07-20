'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

type CatalogOrderDragListProps<T> = {
  items: T[]
  getKey: (item: T, index: number) => string
  onReorder: (next: T[]) => void
  renderLabel: (item: T, index: number) => ReactNode
  /** Hint shown under the list on touch devices. */
  mobileHint?: string
  className?: string
}

const LONG_PRESS_MS = 380

/**
 * Touch-friendly reorder list — long-press the row (or grip), then drag up/down.
 * Desktop: drag the grip handle immediately (HTML5 drag-and-drop).
 */
export default function CatalogOrderDragList<T>({
  items,
  getKey,
  onReorder,
  renderLabel,
  mobileHint = 'Long-press the row, then drag to reorder',
  className = '',
}: CatalogOrderDragListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [touchReady, setTouchReady] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const touchDragActive = useRef(false)
  const touchStartY = useRef(0)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (!touchDragActive.current) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [dragIndex])

  const commitMove = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      onReorder(next)
    },
    [items, onReorder],
  )

  const indexFromClientY = useCallback(
    (clientY: number) => {
      for (let i = 0; i < items.length; i++) {
        const el = rowRefs.current.get(i)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const mid = rect.top + rect.height / 2
        if (clientY < mid) return i
      }
      return items.length - 1
    },
    [items.length],
  )

  const beginTouchDrag = useCallback((index: number) => {
    touchDragActive.current = true
    setTouchReady(true)
    setDragIndex(index)
    setOverIndex(index)
    if (navigator.vibrate) navigator.vibrate(12)
  }, [])

  const onTouchStart = useCallback(
    (index: number, e: React.TouchEvent) => {
      clearLongPress()
      touchDragActive.current = false
      setTouchReady(false)
      touchStartY.current = e.touches[0]?.clientY ?? 0
      longPressTimer.current = window.setTimeout(() => {
        beginTouchDrag(index)
      }, LONG_PRESS_MS)
    },
    [beginTouchDrag, clearLongPress],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchStartY.current
      if (!touchDragActive.current) {
        if (Math.abs(y - touchStartY.current) > 12) clearLongPress()
        return
      }
      e.preventDefault()
      setOverIndex(indexFromClientY(y))
    },
    [clearLongPress, indexFromClientY],
  )

  const endTouchDrag = useCallback(() => {
    clearLongPress()
    if (touchDragActive.current && dragIndex != null && overIndex != null) {
      commitMove(dragIndex, overIndex)
    }
    touchDragActive.current = false
    setTouchReady(false)
    setDragIndex(null)
    setOverIndex(null)
  }, [clearLongPress, commitMove, dragIndex, overIndex])

  const onDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDragIndex(index)
    setOverIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }, [])

  const onDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIndex(index)
  }, [])

  const onDrop = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault()
      const from = dragIndex ?? parseInt(e.dataTransfer.getData('text/plain'), 10)
      if (Number.isFinite(from)) commitMove(from, index)
      setDragIndex(null)
      setOverIndex(null)
    },
    [commitMove, dragIndex],
  )

  const onDragEnd = useCallback(() => {
    setDragIndex(null)
    setOverIndex(null)
  }, [])

  if (items.length === 0) return null

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] text-slate-500 sm:hidden">{mobileHint}</p>
      <div
        className={`space-y-1 ${touchReady ? 'touch-none select-none' : ''}`}
        onTouchEnd={endTouchDrag}
        onTouchCancel={endTouchDrag}
      >
        {items.map((item, index) => {
          const key = getKey(item, index)
          const isDragging = dragIndex === index
          const isDropTarget =
            overIndex === index && dragIndex != null && dragIndex !== index
          return (
            <div
              key={key}
              ref={(el) => {
                if (el) rowRefs.current.set(index, el)
                else rowRefs.current.delete(index)
              }}
              onDragOver={(e) => onDragOver(index, e)}
              onDrop={(e) => onDrop(index, e)}
              onTouchStart={(e) => onTouchStart(index, e)}
              onTouchMove={onTouchMove}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                isDragging
                  ? 'z-10 border-amber-500/50 bg-amber-500/10 opacity-95 shadow-md ring-1 ring-amber-500/30'
                  : isDropTarget
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-white/5 bg-slate-900/50'
              }`}
            >
              <button
                type="button"
                draggable
                onDragStart={(e) => onDragStart(index, e)}
                onDragEnd={onDragEnd}
                className="touch-none shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-amber-400 active:text-amber-400"
                aria-label={`Drag to reorder item ${index + 1}`}
                title="Drag to reorder (long-press row on mobile)"
                onClick={(e) => e.preventDefault()}
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300 sm:text-sm">
                {renderLabel(item, index)}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 hidden text-[10px] text-slate-500 sm:block">
        Drag the grip handle to reorder · changes apply after Save Order
      </p>
    </div>
  )
}
