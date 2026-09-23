'use client'

import { erpInputCls } from '@/components/reseller/erp/erp-ui'
import { toIsoDateInput } from '@/lib/erp-date-format'

type Props = {
  value: string
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
}

/** Native date input — reliable typing, picker, and mobile UX (value is yyyy-mm-dd). */
export function ErpDateInput({ value, onChange, className }: Props) {
  const iso = toIsoDateInput(value)

  return (
    <input
      type="date"
      className={className ?? erpInputCls}
      value={iso}
      onChange={(e) => onChange(e.target.value || '')}
      autoComplete="off"
    />
  )
}
