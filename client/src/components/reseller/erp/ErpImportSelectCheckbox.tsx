'use client'

import { useEffect, useRef } from 'react'

export function ErpImportSelectCheckbox({
  state,
  disabled,
  onToggle,
  ariaLabel,
}: {
  state: 'all' | 'some' | 'none'
  disabled?: boolean
  onToggle: (checked: boolean) => void
  ariaLabel: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])

  return (
    <input
      ref={ref}
      type="checkbox"
      className="mt-1 size-4 shrink-0 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
      checked={state === 'all'}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation()
        onToggle(e.target.checked)
      }}
    />
  )
}
