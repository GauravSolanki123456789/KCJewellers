'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

type DualRangeSliderProps = {
  min: number
  max: number
  low: number
  high: number
  onLowChange: (v: number) => void
  onHighChange: (v: number) => void
  step?: number
  label?: string
  formatValue?: (v: number) => string
}

/**
 * Premium double-ended range slider. Track: dark muted, active range: amber, thumbs: white.
 */
export default function DualRangeSlider({
  min,
  max,
  low,
  high,
  onLowChange,
  onHighChange,
  step = 1,
  label = '',
  formatValue = (v) => String(Math.round(v)),
}: DualRangeSliderProps) {
  const [lowVal, setLowVal] = useState(low)
  const [highVal, setHighVal] = useState(high)
  const rangeRef = useRef<HTMLDivElement>(null)

  const safeMin = min >= max ? min : Math.min(min, max)
  const safeMax = max <= min ? max : Math.max(min, max)
  const denom = safeMax - safeMin || 1

  useEffect(() => {
    const lo = Math.min(Math.max(low, safeMin), safeMax)
    const hi = Math.max(Math.min(high, safeMax), safeMin)
    let loClamped = lo
    let hiClamped = Math.max(hi, loClamped + step)
    if (hiClamped > safeMax) {
      hiClamped = safeMax
      loClamped = Math.max(safeMin, hiClamped - step)
    }
    setLowVal(loClamped)
    setHighVal(hiClamped)
  }, [low, high, safeMin, safeMax, step])

  const percentLow = Math.max(0, Math.min(100, ((lowVal - safeMin) / denom) * 100))
  const percentHigh = Math.max(0, Math.min(100, ((highVal - safeMin) / denom) * 100))

  const handleLowChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = Number(e.target.value)
      v = Math.min(v, highVal - step)
      v = Math.max(v, safeMin)
      v = Math.min(v, safeMax)
      setLowVal(v)
      onLowChange(v)
    },
    [highVal, step, onLowChange, safeMin, safeMax],
  )

  const handleHighChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = Number(e.target.value)
      v = Math.max(v, lowVal + step)
      v = Math.min(v, safeMax)
      v = Math.max(v, safeMin)
      setHighVal(v)
      onHighChange(v)
    },
    [lowVal, step, onHighChange, safeMin, safeMax],
  )

  return (
    <div className="space-y-2 min-h-[4.5rem]">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-300 font-medium tabular-nums">
            {formatValue(lowVal)} – {formatValue(highVal)}
          </span>
        </div>
      )}
      <div className="relative h-8 flex items-center" ref={rangeRef}>
        {/* Track background */}
        <div className="absolute w-full h-1.5 rounded-full bg-slate-700" />
        {/* Active range fill */}
        <div
          className="absolute h-1.5 rounded-full bg-amber-500 transition-[left,width] duration-150 ease-out"
          style={{
            left: `${percentLow}%`,
            width: `${Math.max(0, percentHigh - percentLow)}%`,
          }}
        />
        {/* Low thumb input */}
        <input
          type="range"
          min={safeMin}
          max={safeMax}
          step={step}
          value={lowVal}
          onChange={handleLowChange}
          className="dual-range-thumb absolute w-full h-8 appearance-none bg-transparent z-10"
        />
        {/* High thumb input - overlapping, higher z so its thumb is on top when overlapping */}
        <input
          type="range"
          min={safeMin}
          max={safeMax}
          step={step}
          value={highVal}
          onChange={handleHighChange}
          className="dual-range-thumb absolute w-full h-8 appearance-none bg-transparent z-20"
        />
      </div>
    </div>
  )
}
