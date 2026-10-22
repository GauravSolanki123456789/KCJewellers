'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'

/** Reseller ERP setting: dual ₹ + metal ledger (off by default). */
export function useJewelleryLedgerMetalEnabled() {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void axios
      .get<{ settings?: { jewelleryLedgerMetalEnabled?: boolean } }>('/api/reseller/erp/settings')
      .then((r) => {
        setEnabled(r.data.settings?.jewelleryLedgerMetalEnabled === true)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  return { enabled, loaded }
}
