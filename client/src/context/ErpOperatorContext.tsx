'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import axios from '@/lib/axios'
import type { ResellerErpModuleId } from '@/lib/reseller-erp-modules'

export type ErpOperator = {
  id: number
  username: string
  displayName: string
  role: 'admin' | 'staff'
  allowedModules: string[]
  fullAccess: boolean
  shadowAccess: boolean
  isActive?: boolean
}

type ErpOperatorContextValue = {
  operator: ErpOperator | null
  shadowUnlocked: boolean
  loading: boolean
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  unlockShadow: (sequence: string) => Promise<void>
  lockShadow: () => Promise<void>
  canAccessModule: (moduleId: ResellerErpModuleId | string) => boolean
}

const ErpOperatorContext = createContext<ErpOperatorContextValue | null>(null)

export function ErpOperatorProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<ErpOperator | null>(null)
  const [shadowUnlocked, setShadowUnlocked] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await axios.get<{ operator: ErpOperator | null; shadowUnlocked?: boolean }>(
        '/api/reseller/erp/operators/me',
      )
      setOperator(res.data.operator)
      setShadowUnlocked(!!res.data.shadowUnlocked)
    } catch {
      setOperator(null)
      setShadowUnlocked(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await axios.post<{ operator: ErpOperator }>('/api/reseller/erp/operators/login', {
      username,
      password,
    })
    setOperator(res.data.operator)
    setShadowUnlocked(false)
  }, [])

  const logout = useCallback(async () => {
    await axios.post('/api/reseller/erp/operators/logout')
    setOperator(null)
    setShadowUnlocked(false)
  }, [])

  const unlockShadow = useCallback(async (sequence: string) => {
    await axios.post('/api/reseller/erp/shadow/unlock', { sequence })
    setShadowUnlocked(true)
  }, [])

  const lockShadow = useCallback(async () => {
    await axios.post('/api/reseller/erp/shadow/lock')
    setShadowUnlocked(false)
  }, [])

  const canAccessModule = useCallback(
    (moduleId: string) => {
      if (!operator) return false
      if (moduleId === 'erp-users') return operator.role === 'admin'
      if (operator.role === 'admin' || operator.fullAccess) return true
      return operator.allowedModules.includes(moduleId)
    },
    [operator],
  )

  const value = useMemo(
    () => ({
      operator,
      shadowUnlocked,
      loading,
      refresh,
      login,
      logout,
      unlockShadow,
      lockShadow,
      canAccessModule,
    }),
    [operator, shadowUnlocked, loading, refresh, login, logout, unlockShadow, lockShadow, canAccessModule],
  )

  return <ErpOperatorContext.Provider value={value}>{children}</ErpOperatorContext.Provider>
}

export function useErpOperator() {
  const ctx = useContext(ErpOperatorContext)
  if (!ctx) throw new Error('useErpOperator must be used within ErpOperatorProvider')
  return ctx
}
