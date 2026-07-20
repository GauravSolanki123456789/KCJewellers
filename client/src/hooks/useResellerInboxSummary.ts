'use client'

import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import type { ResellerInboxSummaryData } from '@/lib/reseller-inbox-summary'
import { KC_RESELLER_INBOX_REFRESH_EVENT } from '@/lib/reseller-inbox-summary'

const POLL_MS = 60_000

function getApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

type InboxResponse = { success?: boolean; data?: ResellerInboxSummaryData }

export function useResellerInboxSummary(enabled: boolean) {
  const [data, setData] = useState<ResellerInboxSummaryData | null>(null)
  const [error, setError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!enabled) return
    const base = getApiUrl()
    try {
      const res = await axios.get<InboxResponse>(`${base}/api/reseller/inbox-summary`, {
        withCredentials: true,
      })
      if (res.data?.success && res.data.data) {
        setData(res.data.data)
        setError(null)
      }
    } catch (e) {
      setError(e)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setData(null)
      return
    }
    void load()
    const id = window.setInterval(() => {
      void load()
    }, POLL_MS)
    const onRefresh = () => {
      void load()
    }
    window.addEventListener(KC_RESELLER_INBOX_REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(KC_RESELLER_INBOX_REFRESH_EVENT, onRefresh)
      window.clearInterval(id)
    }
  }, [enabled, load])

  return { data, error, refetch: load }
}
