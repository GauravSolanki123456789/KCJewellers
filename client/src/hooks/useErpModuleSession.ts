'use client'

import { useEffect, useRef, useState } from 'react'
import {
  loadErpModuleSession,
  saveErpModuleSession,
  type ErpModuleSessionId,
} from '@/lib/erp-module-session'

/** Restore once after mount (avoids SSR/client sessionStorage mismatch); debounce-save on change. */
export function useErpModuleSession<T>(
  moduleId: ErpModuleSessionId | string,
  buildSnapshot: () => T,
  deps: React.DependencyList,
  options?: { enabled?: boolean },
): T | null {
  const enabled = options?.enabled !== false
  const [restored, setRestored] = useState<T | null>(null)
  const readyRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    setRestored(loadErpModuleSession<T>(moduleId))
  }, [moduleId, enabled])

  useEffect(() => {
    readyRef.current = true
  }, [])

  useEffect(() => {
    if (!enabled || !readyRef.current) return
    const timer = window.setTimeout(() => {
      saveErpModuleSession(moduleId, buildSnapshot())
    }, 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, enabled, ...deps])

  return restored
}
