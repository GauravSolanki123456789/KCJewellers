'use client'

import { useCallback, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { BILL_TEMPLATE_VARS } from '@/lib/erp-print-templates'
import { Eye, Loader2, RotateCcw } from 'lucide-react'

type Props = {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  previewKind: 'bill' | 'estimate_gold' | 'estimate_silver'
  onReset?: () => void
}

export function ErpTemplateEditor({ label, hint, value, onChange, previewKind, onReset }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = textareaRef.current
      if (!el) {
        onChange(`${value}${text}`)
        return
      }
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length
      const next = `${value.slice(0, start)}${text}${value.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        el.focus()
        const pos = start + text.length
        el.setSelectionRange(pos, pos)
      })
    },
    [onChange, value],
  )

  const runPreview = async () => {
    setPreviewBusy(true)
    try {
      const res = await axios.post<{ preview: string }>('/api/reseller/erp/print/preview-template', {
        template: value,
        kind: previewKind,
      })
      setPreview(res.data.preview || '')
    } catch {
      setPreview('Preview failed — save settings and try again.')
    } finally {
      setPreviewBusy(false)
    }
  }

  return (
    <div className={erpCardCls}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{label}</p>
          {hint ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">{hint}</p>
          ) : null}
        </div>
        {onReset ? (
          <button type="button" className={erpBtnGhost} onClick={onReset}>
            <RotateCcw className="size-4" />
            Reset sample
          </button>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {BILL_TEMPLATE_VARS.map((v) => (
          <button
            key={v}
            type="button"
            className="min-h-[32px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 py-1 font-mono text-[10px] text-[var(--color-jewelry-black,#1a1814)]/75 hover:border-[var(--kc-accent,#c41e3a)]/40"
            onClick={() => insertAtCursor(`{{${v}}}`)}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className={erpBtnGhost} onClick={() => insertAtCursor('\n================================\n')}>
          Insert === line
        </button>
        <button type="button" className={erpBtnGhost} onClick={() => insertAtCursor('\n--------------------------------\n')}>
          Insert --- line
        </button>
        <button type="button" className={erpBtnGhost} onClick={() => insertAtCursor('\n\n')}>
          Blank line
        </button>
        <button type="button" className={erpBtnPrimary} disabled={previewBusy} onClick={() => void runPreview()}>
          {previewBusy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          Preview
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className={`${erpInputCls} min-h-[280px] whitespace-pre-wrap font-mono text-[11px] leading-relaxed`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />

      {preview != null ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase text-emerald-900">Sample preview</p>
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]">
            {preview}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
