'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  capProductIdSelection,
  catalogLimitsForAuthUser,
  effectiveMaxSelectableProducts,
  type ResellerCatalogLimits,
} from '@/lib/reseller-catalog-limits'

export type WhatsAppCatalogOutputFormat = 'temporary_web_link' | 'pdf'

export type CatalogBuilderContextValue = {
  catalogBuilderMode: boolean
  setCatalogBuilderMode: (v: boolean) => void
  selectedProductIds: string[]
  toggleProductId: (id: string) => void
  setSelectedProductIds: (ids: string[] | ((prev: string[]) => string[])) => void
  addProductIds: (ids: string[]) => void
  removeProductIds: (ids: string[]) => void
  clearSelection: () => void
  isProductSelected: (id: string) => boolean
  catalogLimits: ResellerCatalogLimits
  maxSelectable: number | null
  selectionAtLimit: boolean
}

const CatalogBuilderContext = createContext<CatalogBuilderContextValue | null>(null)

function applyMax(ids: string[], max: number | null): string[] {
  return capProductIdSelection(ids, max)
}

export function CatalogBuilderProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [catalogBuilderMode, setCatalogBuilderMode] = useState(false)
  const [selectedProductIds, setSelectedProductIdsState] = useState<string[]>([])

  const catalogLimits = useMemo(
    () => catalogLimitsForAuthUser(auth.user),
    [auth.user],
  )
  const maxSelectable = useMemo(
    () => effectiveMaxSelectableProducts(catalogLimits),
    [catalogLimits],
  )

  const setSelectedProductIds = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setSelectedProductIdsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        return applyMax([...new Set(next.map(String).filter(Boolean))], maxSelectable)
      })
    },
    [maxSelectable],
  )

  const toggleProductId = useCallback(
    (id: string) => {
      const k = String(id).trim()
      if (!k) return
      setSelectedProductIdsState((prev) => {
        if (prev.includes(k)) return prev.filter((x) => x !== k)
        if (maxSelectable != null && prev.length >= maxSelectable) return prev
        return [...prev, k]
      })
    },
    [maxSelectable],
  )

  const addProductIds = useCallback(
    (ids: string[]) => {
      setSelectedProductIdsState((prev) =>
        applyMax([...prev, ...ids.map(String).filter(Boolean)], maxSelectable),
      )
    },
    [maxSelectable],
  )

  const removeProductIds = useCallback((ids: string[]) => {
    const drop = new Set(ids.map(String))
    setSelectedProductIdsState((prev) => prev.filter((x) => !drop.has(x)))
  }, [])

  const clearSelection = useCallback(() => setSelectedProductIdsState([]), [])

  const isProductSelected = useCallback(
    (id: string) => selectedProductIds.includes(String(id).trim()),
    [selectedProductIds],
  )

  const selectionAtLimit =
    maxSelectable != null && maxSelectable > 0 && selectedProductIds.length >= maxSelectable

  const value = useMemo(
    () => ({
      catalogBuilderMode,
      setCatalogBuilderMode,
      selectedProductIds,
      toggleProductId,
      setSelectedProductIds,
      addProductIds,
      removeProductIds,
      clearSelection,
      isProductSelected,
      catalogLimits,
      maxSelectable,
      selectionAtLimit,
    }),
    [
      catalogBuilderMode,
      selectedProductIds,
      toggleProductId,
      setSelectedProductIds,
      addProductIds,
      removeProductIds,
      clearSelection,
      isProductSelected,
      catalogLimits,
      maxSelectable,
      selectionAtLimit,
    ],
  )

  return (
    <CatalogBuilderContext.Provider value={value}>{children}</CatalogBuilderContext.Provider>
  )
}

export function useCatalogBuilder(): CatalogBuilderContextValue {
  const ctx = useContext(CatalogBuilderContext)
  if (!ctx) {
    throw new Error('useCatalogBuilder must be used within CatalogBuilderProvider')
  }
  return ctx
}

export function useCatalogBuilderOptional(): CatalogBuilderContextValue | null {
  return useContext(CatalogBuilderContext)
}
