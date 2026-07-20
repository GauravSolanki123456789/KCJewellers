'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
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

const LONG_PRESS_MS = 420

/**
 * Touch-friendly reorder list — long-press the grip, then drag up/down.
 * Desktop: drag the grip handle immediately (HTML5 drag-and-drop).
 */
export default function CatalogOrderDragList<T>({
  items,
  getKey,
  onReorder,
  renderLabel,
  mobileHint = 'Long-press the grip, then drag to reorder',
  className = '',
}: CatalogOrderDragListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
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

  const indexFromClientY = useCallback((clientY: number) => {
    for (let i = 0; i < items.length; i++) {
      const el = rowRefs.current.get(i)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) return i
    }
    return items.length - 1
  }, [items.length])

  const onTouchStart = useCallback(
    (index: number, e: React.TouchEvent) => {
      clearLongPress()
      touchDragActive.current = false
      touchStartY.current = e.touches[0]?.clientY ?? 0
      longPressTimer.current = window.setTimeout(() => {
        touchDragActive.current = true
        setDragIndex(index)
        setOverIndex(index)
        if (navigator.vibrate) navigator.vibrate(12)
      }, LONG_PRESS_MS)
    },
    [clearLongPress],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchDragActive.current || dragIndex == null) return
      e.preventDefault()
      const y = e.touches[0]?.clientY ?? touchStartY.current
      setOverIndex(indexFromClientY(y))
    },
    [dragIndex, indexFromClientY],
  )

  const onTouchEnd = useCallback(() => {
    clearLongPress()
    if (touchDragActive.current && dragIndex != null && overIndex != null) {
      commitMove(dragIndex, overIndex)
    }
    touchDragActive.current = false
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
      <div className="space-y-1" onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
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
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                isDragging
                  ? 'border-amber-500/50 bg-amber-500/10 opacity-90 shadow-md'
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
                onTouchStart={(e) => onTouchStart(index, e)}
                onTouchMove={onTouchMove}
                className="touch-none shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-amber-400 active:text-amber-400"
                aria-label={`Drag to reorder item ${index + 1}`}
                title="Drag to reorder (long-press on mobile)"
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
