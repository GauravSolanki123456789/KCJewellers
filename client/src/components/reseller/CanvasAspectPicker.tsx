'use client'

import { CANVAS_ASPECTS } from '@/lib/reseller-enhanced-pictures'

type Props = {
  value: string
  onChange: (v: string) => void
  label?: string
}

export function CanvasAspectPicker({ value, onChange, label = '03 · Canvas aspect' }: Props) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
        {label}
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {CANVAS_ASPECTS.map((a) => {
          const selected = value === a
          return (
            <button
              key={a}
              type="button"
              onClick={() => onChange(a)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                selected
                  ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--color-jewelry-black,#1a1814)]'
                  : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/80'
              }`}
            >
              <span
                className={`mb-1 block rounded-sm border-2 ${
                  selected
                    ? 'border-[var(--kc-accent,#c41e3a)]'
                    : 'border-[var(--color-jewelry-black,#1a1814)]/25'
                }`}
                style={{
                  width: a === '16:9' ? 28 : a === '9:16' ? 14 : a === '3:4' || a === '4:5' ? 16 : 20,
                  height: a === '16:9' ? 14 : a === '9:16' ? 28 : a === '3:4' ? 22 : a === '4:5' ? 20 : 20,
                }}
              />
              {a}
              {a === '1:1' ? (
                <span className="text-[10px] font-normal text-[var(--color-jewelry-black,#1a1814)]/45">
                  basic
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
