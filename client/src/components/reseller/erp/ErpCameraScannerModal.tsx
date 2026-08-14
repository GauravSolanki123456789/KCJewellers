'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { startErpBarcodeScanner } from '@/lib/erp-barcode-scanner'
import { erpBtnGhost, erpBtnPrimary } from '@/components/reseller/erp/erp-ui'
import { Camera, Loader2, X } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export function ErpCameraScannerModal({ open, onClose, onScan }: Props) {
  const uid = useId().replace(/:/g, '')
  const readerId = `erp-barcode-reader-${uid}`
  const stopRef = useRef<(() => Promise<void>) | null>(null)
  const [status, setStatus] = useState('Allow camera access when prompted.')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const cleanup = useCallback(async () => {
    if (stopRef.current) {
      await stopRef.current()
      stopRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      void cleanup()
      setError(null)
      setStatus('Allow camera access when prompted.')
      return
    }

    let cancelled = false
    setStarting(true)
    setError(null)

    const t = window.setTimeout(() => {
      void startErpBarcodeScanner(readerId, {
        onStatus: (s) => {
          if (!cancelled) setStatus(s)
        },
        onError: (m) => {
          if (!cancelled) {
            setError(m)
            setStarting(false)
          }
        },
        onDecode: (raw) => {
          if (cancelled) return
          onScan(raw)
          onClose()
        },
      })
        .then((stop) => {
          if (cancelled) {
            void stop()
            return
          }
          stopRef.current = stop
          setStarting(false)
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Scanner failed')
            setStarting(false)
          }
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      void cleanup()
    }
  }, [open, readerId, onScan, onClose, cleanup])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scan barcode"
    >
      <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[var(--color-slate-900,#faf8f4)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Camera className="size-4 text-[var(--kc-accent,#c41e3a)]" />
            Scan barcode / QR
          </div>
          <button type="button" className={erpBtnGhost} aria-label="Close scanner" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-black">
          <div id={readerId} className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[42%] w-[78%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {starting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-8 animate-spin text-white" />
            </div>
          ) : null}
        </div>

        <div className="space-y-2 px-4 py-3">
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/70">{status}</p>
          {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
          <p className="text-[10px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/45">
            Works on phone and laptop — use the rear camera on mobile. Hold steady inside the box; product adds
            automatically when detected.
          </p>
          <button type="button" className={`${erpBtnPrimary} w-full`} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
