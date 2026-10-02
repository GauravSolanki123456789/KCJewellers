'use client'

import { useEffect } from 'react'

export function DigiPwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const register = async () => {
      try {
        await navigator.serviceWorker.register('/digi-sw.js', { scope: '/digi' })
      } catch {
        /* ignore — PWA is progressive */
      }
    }
    void register()
  }, [])
  return null
}
