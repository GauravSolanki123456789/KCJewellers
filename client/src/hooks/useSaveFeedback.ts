'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Brief "Saved" state after async save — clears automatically. */
export function useSaveFeedback(durationMs = 2800) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const markSaved = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaved(true)
    timerRef.current = setTimeout(() => {
      setSaved(false)
      timerRef.current = null
    }, durationMs)
  }, [durationMs])

  const runSave = useCallback(
    async (fn: () => Promise<void>) => {
      if (saving) return
      setSaving(true)
      setSaved(false)
      try {
        await fn()
        markSaved()
      } finally {
        setSaving(false)
      }
    },
    [saving, markSaved],
  )

  return { saved, saving, markSaved, runSave, setSaving }
}
