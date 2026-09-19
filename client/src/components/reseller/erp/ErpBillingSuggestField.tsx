'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export type BillingSuggestOption = {
  value: string
  hint?: string
}

type Props = {
  value: string
  placeholder: string
  options: Array<string | BillingSuggestOption>
  autoFocus?: boolean
  emptyText?: string
  /** When true, Enter / list shows Create "…" if no exact match. */
  allowCreate?: boolean
  /** Preserve typed casing on create (default uppercases like billing). */
  preserveCase?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  inputRef?: (el: HTMLInputElement | null) => void
}

function norm(v: string): string {
  return v.trim().toUpperCase()
}

function toOption(raw: string | BillingSuggestOption): BillingSuggestOption {
  return typeof raw === 'string' ? { value: raw } : raw
}

export function ErpBillingSuggestField({
  value,
  placeholder,
  options,
  autoFocus,
  emptyText = 'No matches',
  allowCreate = false,
  preserveCase = false,
  onChange,
  onCommit,
  inputRef,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pickIdx, setPickIdx] = useState(-1)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [mounted, setMounted] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const keyboardNavRef = useRef(false)
  const localInput = useRef<HTMLInputElement | null>(null)

  const parsed = useMemo(() => {
    const seen = new Set<string>()
    const out: BillingSuggestOption[] = []
    for (const raw of options) {
      const opt = toOption(raw)
      const key = norm(opt.value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(opt)
    }
    return out
  }, [options])

  const filtered = useMemo(() => {
    const q = norm(value)
    const base = !q
      ? parsed
      : parsed.filter(
          (o) => norm(o.value).includes(q) || norm(o.hint || '').includes(q),
        )
    if (!allowCreate) return base
    const typed = value.trim()
    if (!typed) return base
    const exact = base.some((o) => norm(o.value) === norm(typed))
    if (exact) return base
    return [{ value: typed, hint: 'Create new' }, ...base]
  }, [parsed, value, allowCreate])

  const placeMenu = () => {
    const el = localInput.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const spaceBelow = window.innerHeight - r.bottom - gap
    const spaceAbove = r.top - gap
    const maxH = Math.min(360, Math.round(window.innerHeight * 0.45))
    const placeUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const height = Math.max(140, Math.min(maxH, placeUp ? spaceAbove : spaceBelow))
    const width = Math.min(Math.max(r.width, 220), window.innerWidth - 16)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    setMenuStyle({
      position: 'fixed',
      left,
      width,
      zIndex: 240,
      maxHeight: height,
      ...(placeUp
        ? { bottom: window.innerHeight - r.top + gap }
        : { top: r.bottom + gap }),
    })
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    placeMenu()
    const onWin = () => placeMenu()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open, filtered.length, value])

  useEffect(() => {
    if (!open || pickIdx < 0 || !keyboardNavRef.current) return
    optionRefs.current[pickIdx]?.scrollIntoView({ block: 'nearest' })
    keyboardNavRef.current = false
  }, [open, pickIdx])

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, filtered.length)
  }, [filtered.length])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) {
      setOpen(false)
      setPickIdx(-1)
      return
    }
    onChange(preserveCase ? trimmed : trimmed.toUpperCase())
    onCommit(trimmed)
    setOpen(false)
    setPickIdx(-1)
    requestAnimationFrame(() => localInput.current?.blur())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      keyboardNavRef.current = true
      setOpen(true)
      setPickIdx((i) => {
        if (filtered.length === 0) return -1
        if (i < 0) return 0
        return Math.min(i + 1, filtered.length - 1)
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      keyboardNavRef.current = true
      setPickIdx((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setPickIdx(-1)
      return
    }
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault()
      if (pickIdx >= 0 && filtered[pickIdx]) {
        commit(filtered[pickIdx].value)
        return
      }
      const q = norm(value)
      if (!q) {
        setOpen(false)
        setPickIdx(-1)
        onCommit('')
        return
      }
      const exact = filtered.find((o) => norm(o.value) === q)
      if (exact) {
        commit(exact.value)
        return
      }
      commit(value)
    }
  }

  const menu =
    open && (value.trim() || parsed.length > 0) ? (
      <ul
        ref={menuRef}
        className="overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white py-1 shadow-2xl"
        style={menuStyle}
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">{emptyText}</li>
        ) : (
          filtered.slice(0, 60).map((opt, i) => (
            <li key={opt.value}>
              <button
                ref={(el) => {
                  optionRefs.current[i] = el
                }}
                type="button"
                className={`w-full px-3 py-2.5 text-left text-sm leading-snug text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--kc-accent,#c41e3a)]/[0.06] ${
                  pickIdx === i ? 'bg-[var(--kc-accent,#c41e3a)]/[0.08]' : ''
                }`}
                onMouseEnter={() => setPickIdx(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(opt.value)}
              >
                {opt.hint === 'Create new' ? (
                  <>
                    Create &ldquo;{opt.value}&rdquo;
                  </>
                ) : (
                  opt.value
                )}
                {opt.hint && opt.hint !== 'Create new' ? (
                  <span className="ml-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                    · {opt.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    ) : null

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <input
        ref={(el) => {
          localInput.current = el
          inputRef?.(el)
        }}
        autoFocus={autoFocus}
        className="w-full min-w-0 rounded-xl border border-emerald-300 bg-white px-2 py-1.5 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50"
        placeholder={placeholder}
        value={value === '—' ? '' : value}
        onFocus={() => {
          setOpen(true)
          requestAnimationFrame(placeMenu)
        }}
        onChange={(e) => {
          const v = e.target.value
          onChange(preserveCase ? v : v.toUpperCase())
          setOpen(true)
          setPickIdx(-1)
        }}
        onKeyDown={onKeyDown}
      />
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
