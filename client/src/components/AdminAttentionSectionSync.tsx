'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import axios from 'axios'
import { getAdminAttentionSectionKeyFromPathname } from '@/lib/admin-attention-sections'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'

function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

/**
 * Marks the current admin subsection as seen so unread badges drop until new activity.
 * Dispatches KC_ADMIN_INBOX_REFRESH_EVENT so all useAdminInboxSummary hooks refetch.
 */
export default function AdminAttentionSectionSync() {
  const pathname = usePathname()

  useEffect(() => {
    const attentionSectionKey = getAdminAttentionSectionKeyFromPathname(pathname)
    if (!attentionSectionKey) return

    const t = window.setTimeout(() => {
      axios
        .post(
          `${getApiBase()}/api/admin/attention/mark-seen`,
          { attentionSectionKey },
          { withCredentials: true }
        )
        .then(() => {
          window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
        })
        .catch(() => {})
    }, 400)

    return () => window.clearTimeout(t)
  }, [pathname])

  return null
}
