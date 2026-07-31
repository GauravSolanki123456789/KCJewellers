'use client'

import { useEffect, useState } from 'react'
import { erpInputCls } from '@/components/reseller/erp/erp-ui'
import { isoToDdMmYyyyInput, parseDdMmYyyyToIso } from '@/lib/erp-date-format'

type Props = {
  value: string
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
}

export function ErpDateInput({ value, onChange, className, placeholder = 'dd/mm/yyyy' }: Props) {
  const [text, setText] = useState(() => isoToDdMmYyyyInput(value))

  useEffect(() => {
    setText(isoToDdMmYyyyInput(value))
  }, [value])

  return (
    <input
      type="text"
      className={className ?? erpInputCls}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const v = e.target.value
        setText(v)
        if (!v.trim()) {
          onChange('')
          return
        }
        const iso = parseDdMmYyyyToIso(v)
        if (iso) onChange(iso)
      }}
      onBlur={() => {
        if (!text.trim()) {
          onChange('')
          return
        }
        const iso = parseDdMmYyyyToIso(text)
        if (iso) {
          onChange(iso)
          setText(isoToDdMmYyyyInput(iso))
        } else if (value) {
          setText(isoToDdMmYyyyInput(value))
        }
      }}
    />
  )
}
