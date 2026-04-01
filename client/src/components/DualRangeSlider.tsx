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

  useEffect(() => {
    const clamp = (v: number) => Math.min(max, Math.max(min, v))
    let lo = clamp(low)
    let hi = clamp(high)
    if (lo > hi) {
      lo = min
      hi = max
    }
    setLowVal(lo)
    setHighVal(hi)
  }, [low, high, min, max])

  const span = Math.max(max - min, 1e-9)
  const percentLow = ((lowVal - min) / span) * 100
  const percentHigh = ((highVal - min) / span) * 100

  const handleLowChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.min(Number(e.target.value), highVal - step)
      setLowVal(v)
      onLowChange(v)
    },
    [highVal, step, onLowChange],
  )

  const handleHighChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Math.max(Number(e.target.value), lowVal + step)
      setHighVal(v)
      onHighChange(v)
    },
    [lowVal, step, onHighChange],
  )

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex justify-between items-start gap-2 text-xs min-h-[2.5rem]">
          <span className="text-slate-500 shrink-0">{label}</span>
          <span className="text-slate-300 font-medium tabular-nums text-right leading-snug break-all max-w-[min(100%,11rem)]">
            {formatValue(lowVal)} – {formatValue(highVal)}
          </span>
        </div>
      )}
      <div className="relative h-8 flex items-center shrink-0" ref={rangeRef}>
        {/* Track background */}
        <div className="absolute w-full h-1.5 rounded-full bg-slate-700" />
        {/* Active range fill */}
        <div
          className="absolute h-1.5 rounded-full bg-amber-500 transition-all duration-100"
          style={{
            left: `${percentLow}%`,
            width: `${percentHigh - percentLow}%`,
          }}
        />
        {/* Low thumb input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lowVal}
          onChange={handleLowChange}
          className="dual-range-thumb absolute w-full h-8 appearance-none bg-transparent z-10"
        />
        {/* High thumb input - overlapping, higher z so its thumb is on top when overlapping */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={highVal}
          onChange={handleHighChange}
          className="dual-range-thumb absolute w-full h-8 appearance-none bg-transparent z-20"
        />
      </div>
    </div>
  )
}
