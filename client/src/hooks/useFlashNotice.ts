'use client'

import { useEffect, useState } from 'react'
import { appAlert, type AppNoticeTone } from '@/lib/app-notice'

/** Turn a lingering inline banner into the in-app popup, then clear it. */
export function useFlashNotice(
  msg: string | null | undefined,
  setMsg: (next: any) => void,
  tone: AppNoticeTone = 'success',
) {
  useEffect(() => {
    const text = String(msg ?? '').trim()
    if (!text) return
    appAlert(text, tone)
    setMsg(typeof msg === 'string' ? '' : null)
  }, [msg, setMsg, tone])
}

/** Drop-in for `useState` success banners — pops the in-app notice then clears. */
export function useErpFlash() {
  const [msg, setMsg] = useState<string | null>(null)
  useFlashNotice(msg, setMsg, 'success')
  return [msg, setMsg] as const
}

/** Drop-in for `useState` error banners. */
export function useErpErrorFlash() {
  const [err, setErr] = useState<string | null>(null)
  useFlashNotice(err, setErr, 'error')
  return [err, setErr] as const
}
