'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Loader2, Radio, Tag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { erpBtnGhost, erpBtnPrimary, erpInputCls } from '@/components/reseller/erp/erp-ui'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  barcode: string
  productName?: string
  rfidInput: string
  onRfidInputChange: (value: string) => void
  busy: boolean
  onConfirm: () => void | Promise<void>
}

export function ErpRfidLinkDialog({
  open,
  onOpenChange,
  barcode,
  productName,
  rfidInput,
  onRfidInputChange,
  busy,
  onConfirm,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        if (!busy) void onConfirm()
      }
    },
    [busy, onConfirm],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-md"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            <Radio className="size-5 text-[var(--kc-accent,#c41e3a)]" />
            Link Posh RFID tag
          </DialogTitle>
          <DialogDescription className="text-[var(--color-jewelry-black,#1a1814)]/65">
            Barcode <strong className="text-[var(--color-jewelry-black,#1a1814)]">{barcode}</strong>
            {productName ? (
              <>
                {' '}
                · <span className="text-[var(--color-jewelry-black,#1a1814)]/80">{productName}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
            RFID tag number
            <input
              ref={inputRef}
              className={`${erpInputCls} mt-1.5 font-mono uppercase`}
              placeholder="e.g. B0297"
              value={rfidInput}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(e) => onRfidInputChange(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!busy) void onConfirm()
                }
              }}
            />
          </label>
          <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-xs leading-relaxed text-emerald-950">
            Scan or type the yellow Posh tag ID, then press{' '}
            <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-sm">F1</kbd> or{' '}
            <strong>Link &amp; print</strong>. The barcode label prints and stock syncs to the RFID gun.
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={`${erpBtnGhost} w-full sm:w-auto`}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${erpBtnPrimary} w-full sm:w-auto`}
            disabled={busy || !rfidInput.trim()}
            onClick={() => void onConfirm()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />}
            Link &amp; print (F1)
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
