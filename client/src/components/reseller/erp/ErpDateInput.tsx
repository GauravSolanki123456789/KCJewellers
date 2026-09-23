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
  const textRef = useRef('')
  const focusedRef = useRef(false)
  const skipPropSync = useRef(false)
  const [text, setText] = useState(() => isoToDdMmYyyyInput(toIsoDateInput(value) || value))

  textRef.current = text

  useEffect(() => {
    if (skipPropSync.current) {
      skipPropSync.current = false
      return
    }
    if (focusedRef.current) return
    setText(isoToDdMmYyyyInput(toIsoDateInput(value) || value))
  }, [value])

  const applyDigits = (digits: string, prevCaret?: number) => {
    const prevMasked = textRef.current
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
    if (prevCaret != null && inputRef.current) {
      const nextCaret = caretAfterMaskEdit(prevMasked, masked, prevCaret)
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(nextCaret, nextCaret)
      })
    }
  }

  const digitIndexAtCaret = (masked: string, caret: number) =>
    digitsFromDateInput(masked.slice(0, Math.max(0, caret))).length

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return
    const el = inputRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? start
    const masked = textRef.current
    const digits = digitsFromDateInput(masked)

    if (start !== end) {
      e.preventDefault()
      const left = digitIndexAtCaret(masked, start)
      const right = digitIndexAtCaret(masked, end)
      const nextDigits = digits.slice(0, left) + digits.slice(right)
      applyDigits(nextDigits, start)
      return
    }

    if (e.key === 'Backspace' && start > 0) {
      e.preventDefault()
      const idx = digitIndexAtCaret(masked, start)
      if (idx <= 0) {
        applyDigits('', 0)
        return
      }
      applyDigits(digits.slice(0, idx - 1) + digits.slice(idx), start - 1)
      return
    }

    if (e.key === 'Delete' && start < masked.length) {
      e.preventDefault()
      const idx = digitIndexAtCaret(masked, start)
      if (idx >= digits.length) return
      applyDigits(digits.slice(0, idx) + digits.slice(idx + 1), start)
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
      onFocus={() => {
        focusedRef.current = true
      }}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const el = e.target
        applyDigits(digitsFromDateInput(el.value), el.selectionStart ?? undefined)
      }}
      onBlur={() => {
        focusedRef.current = false
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
