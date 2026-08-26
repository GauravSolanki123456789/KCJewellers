'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_ERP_NAV_VISIBILITY,
  normalizeErpNavVisibility,
  type ErpNavVisibility,
} from '@/lib/erp-nav-visibility'
import axios from '@/lib/axios'

export function useErpNavVisibility() {
  const [navVisibility, setNavVisibility] = useState<ErpNavVisibility>(DEFAULT_ERP_NAV_VISIBILITY)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ settings?: { navVisibility?: unknown } }>('/api/reseller/erp/settings')
      setNavVisibility(normalizeErpNavVisibility(res.data.settings?.navVisibility))
    } catch {
      setNavVisibility(DEFAULT_ERP_NAV_VISIBILITY)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { navVisibility, loading, reload }
}
