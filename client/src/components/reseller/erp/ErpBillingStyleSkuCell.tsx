'use client'

import { useMemo } from 'react'
import type { DesignBillingStyle } from '@/lib/erp-billing-shortcuts'

type Props = {
  value: string
  placeholder: string
  options: string[]
  autoFocus?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  inputRef?: (el: HTMLInputElement | null) => void
}

export function ErpBillingStyleSkuCell({
  value,
  placeholder,
  options,
  autoFocus,
  onChange,
  onCommit,
  inputRef,
}: Props) {
  const listId = useMemo(() => `billing-ac-${Math.random().toString(36).slice(2, 9)}`, [])

  return (
    <>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        className="w-full min-w-[72px] rounded border border-emerald-300 bg-emerald-50/40 px-1 py-1 text-[var(--color-jewelry-black,#1a1814)]"
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit(value.trim().toUpperCase())
          }
        }}
        onBlur={() => {
          if (value.trim()) onCommit(value.trim().toUpperCase())
        }}
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  )
}

export function styleOptionsForCatalog(catalog: DesignBillingStyle[], query: string): string[] {
  const q = query.trim().toUpperCase()
  const codes = catalog.map((s) => s.style_code)
  if (!q) return codes
  return codes.filter((c) => c.toUpperCase().includes(q))
}
