'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import axios from 'axios'
import { getResellerAttentionSectionKeyFromPathname } from '@/lib/reseller-attention-sections'
import { KC_RESELLER_INBOX_REFRESH_EVENT } from '@/lib/reseller-inbox-summary'

function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')
}

/** Marks reseller subsection seen so profile/nav badges clear until new inquiries arrive. */
export default function ResellerAttentionSectionSync() {
  const pathname = usePathname()

  useEffect(() => {
    const attentionSectionKey = getResellerAttentionSectionKeyFromPathname(pathname)
    if (!attentionSectionKey) return

    const t = window.setTimeout(() => {
      axios
        .post(
          `${getApiBase()}/api/reseller/attention/mark-seen`,
          { attentionSectionKey },
          { withCredentials: true },
        )
        .then(() => {
          window.dispatchEvent(new Event(KC_RESELLER_INBOX_REFRESH_EVENT))
        })
        .catch(() => {})
    }, 400)

    return () => window.clearTimeout(t)
  }, [pathname])

  return null
}
