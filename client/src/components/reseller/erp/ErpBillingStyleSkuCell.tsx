'use client'

import { useId } from 'react'
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
  const listId = useId()

  const commitCurrent = () => {
    const v = value.trim().toUpperCase()
    if (v) onCommit(v)
  }

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
            commitCurrent()
          } else if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            commitCurrent()
          }
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

export function filterSkusForStyle(
  catalog: DesignBillingStyle[],
  styleCode: string,
  query: string,
): string[] {
  const style = catalog.find((s) => s.style_code.toUpperCase() === styleCode.trim().toUpperCase())
  if (!style) return []
  const q = query.trim().toUpperCase()
  const skus = style.skus.map((s) => s.sku)
  if (!q) return skus
  return skus.filter((sku) => sku.toUpperCase().includes(q))
}
