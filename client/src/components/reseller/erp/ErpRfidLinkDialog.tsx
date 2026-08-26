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
  onLinkOnly?: () => void | Promise<void>
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
  onLinkOnly,
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
            Link RFID tag
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
          <p className="text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            <strong className="text-[var(--color-jewelry-black,#1a1814)]/70">Link only</strong> — close this dialog,
            then use the scale: place the piece and press Print on the Mettler device.
            <br />
            <strong className="text-[var(--color-jewelry-black,#1a1814)]/70">Link &amp; print</strong> — link and print
            the barcode label immediately (F1).
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className={`${erpBtnGhost} w-full sm:mr-auto sm:w-auto`}
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          {onLinkOnly ? (
            <button
              type="button"
              className={`${erpBtnGhost} w-full sm:w-auto`}
              disabled={busy || !rfidInput.trim()}
              onClick={() => void onLinkOnly()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Tag className="size-4" />}
              Link only
            </button>
          ) : null}
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
