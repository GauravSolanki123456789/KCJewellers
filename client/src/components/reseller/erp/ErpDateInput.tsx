'use client'

import { erpInputCls } from '@/components/reseller/erp/erp-ui'
import { isoToDdMmYyyyInput } from '@/lib/erp-date-format'

type Props = {
  value: string
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
}

/** dd/mm/yyyy text field — same format as ERP filters (not browser locale date picker). */
export function ErpDateInput({ value, onChange, className, placeholder = 'dd/mm/yyyy' }: Props) {
  const raw = String(value || '')
  const display = /^\d{4}-\d{2}-\d{2}/.test(raw.trim()) ? isoToDdMmYyyyInput(raw) : raw

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className ?? erpInputCls}
      placeholder={placeholder}
      value={display}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
    />
  )
}
