'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { erpInputCls } from '@/components/reseller/erp/erp-ui'
import {
  caretAfterMaskEdit,
  digitsFromDateInput,
  maskDdMmYyyyFromDigits,
} from '@/lib/erp-date-input-mask'
import { isoToDdMmYyyyInput, parseDdMmYyyyToIso, toIsoDateInput } from '@/lib/erp-date-format'

type Props = {
  value: string
  onChange: (iso: string) => void
  className?: string
  placeholder?: string
}

export function ErpDateInput({ value, onChange, className, placeholder = 'dd/mm/yyyy' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => isoToDdMmYyyyInput(toIsoDateInput(value) || value))
  const skipPropSync = useRef(false)

  useEffect(() => {
    if (skipPropSync.current) {
      skipPropSync.current = false
      return
    }
    setText(isoToDdMmYyyyInput(toIsoDateInput(value) || value))
  }, [value])

  const applyText = (raw: string, caret?: number) => {
    const digits = digitsFromDateInput(raw)
    const masked = maskDdMmYyyyFromDigits(digits)
    setText(masked)
    if (digits.length === 8) {
      const iso = parseDdMmYyyyToIso(masked)
      if (iso) {
        skipPropSync.current = true
        onChange(iso)
      }
    } else if (!digits.length) {
      skipPropSync.current = true
      onChange('')
    }
    if (caret != null && inputRef.current) {
      const nextCaret = caretAfterMaskEdit(text, masked, caret)
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(nextCaret, nextCaret)
      })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return
    const el = inputRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start
    if (start !== end) return
    if (e.key === 'Backspace' && start > 0) {
      const ch = text[start - 1]
      if (ch === '/') {
        e.preventDefault()
        const digits = digitsFromDateInput(text)
        if (!digits.length) return
        const trimmed = digits.slice(0, -1)
        applyText(trimmed, start - 1)
      }
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className={className ?? erpInputCls}
      placeholder={placeholder}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        applyText(e.target.value, e.target.selectionStart ?? undefined)
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
        } else {
          setText('')
        }
      }}
    />
  )
}
