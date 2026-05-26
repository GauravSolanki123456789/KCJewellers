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
    setLowVal(low)
    setHighVal(high)
  }, [low, high])

  const percentLow = ((lowVal - min) / (max - min)) * 100
  const percentHigh = ((highVal - min) / (max - min)) * 100

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
    <div className="space-y-2.5">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="font-medium text-slate-500">{label}</span>
          <span className="font-medium tabular-nums text-slate-300">
            {formatValue(lowVal)} – {formatValue(highVal)}
          </span>
        </div>
      )}
      <div className="relative flex h-7 items-center" ref={rangeRef}>
        <div className="absolute h-0.5 w-full rounded-full bg-slate-700/60" />
        <div
          className="absolute h-0.5 rounded-full bg-slate-400 transition-all duration-100"
          style={{
            left: `${percentLow}%`,
            width: `${percentHigh - percentLow}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lowVal}
          onChange={handleLowChange}
          className="dual-range-thumb absolute z-10 h-7 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={highVal}
          onChange={handleHighChange}
          className="dual-range-thumb absolute z-20 h-7 w-full appearance-none bg-transparent"
        />
      </div>
    </div>
  )
}
