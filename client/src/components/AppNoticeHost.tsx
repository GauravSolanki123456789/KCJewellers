'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import {
  installAppNoticeGlobals,
  registerAppNotice,
  type AppNoticeTone,
} from '@/lib/app-notice'

type ToastItem = {
  id: number
  message: string
  tone: AppNoticeTone
}

type ConfirmItem = {
  id: number
  message: string
  resolve: (ok: boolean) => void
}

let nextId = 1

export function AppNoticeHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirm, setConfirm] = useState<ConfirmItem | null>(null)

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    installAppNoticeGlobals()
    return registerAppNotice(
      (message, tone = 'info') => {
        const id = nextId++
        setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
        const long = message.length > 80 || message.includes('\n')
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }, long ? 12000 : 6000)
      },
      (message) =>
        new Promise<boolean>((resolve) => {
          setConfirm({ id: nextId++, message, resolve })
        }),
    )
  }, [])

  const closeConfirm = (ok: boolean) => {
    setConfirm((current) => {
      current?.resolve(ok)
      return null
    })
  }

  return (
    <>
      {toasts.length ? (
        <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[20000] flex flex-col items-center gap-2 px-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto w-full max-w-md rounded-2xl border bg-white px-3 py-3 shadow-xl sm:px-4 ${
                toast.tone === 'error'
                  ? 'border-rose-200'
                  : toast.tone === 'success'
                    ? 'border-emerald-200'
                    : 'border-[var(--color-slate-700,#e8e4df)]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {toast.tone === 'error' ? (
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-700" />
                ) : toast.tone === 'success' ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-[var(--kc-accent,#c41e3a)]" />
                )}
                <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm font-medium leading-snug text-[#1a1814]">
                  {toast.message}
                </p>
                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[#1a1814]/60 hover:bg-[var(--color-slate-900,#f7f4ef)]"
                  aria-label="Dismiss message"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <button
                type="button"
                className="mt-2 min-h-[40px] w-full rounded-xl bg-[var(--kc-accent,#c41e3a)] text-xs font-semibold text-white"
                onClick={() => dismissToast(toast.id)}
              >
                OK
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-[20010] flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-2xl">
            <p className="whitespace-pre-wrap text-sm font-medium leading-snug text-[#1a1814]">
              {confirm.message}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white text-sm font-semibold text-[#1a1814]"
                onClick={() => closeConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--kc-accent,#c41e3a)] text-sm font-semibold text-white"
                onClick={() => closeConfirm(true)}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
