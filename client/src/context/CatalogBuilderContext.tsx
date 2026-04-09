'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

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
}

const CatalogBuilderContext = createContext<CatalogBuilderContextValue | null>(null)

export function CatalogBuilderProvider({ children }: { children: ReactNode }) {
  const [catalogBuilderMode, setCatalogBuilderMode] = useState(false)
  const [selectedProductIds, setSelectedProductIdsState] = useState<string[]>([])

  const setSelectedProductIds = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setSelectedProductIdsState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        return [...new Set(next.map(String).filter(Boolean))]
      })
    },
    [],
  )

  const toggleProductId = useCallback((id: string) => {
    const k = String(id).trim()
    if (!k) return
    setSelectedProductIdsState((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k)
      return [...prev, k]
    })
  }, [])

  const addProductIds = useCallback((ids: string[]) => {
    setSelectedProductIdsState((prev) => [...new Set([...prev, ...ids.map(String).filter(Boolean)])])
  }, [])

  const removeProductIds = useCallback((ids: string[]) => {
    const drop = new Set(ids.map(String))
    setSelectedProductIdsState((prev) => prev.filter((x) => !drop.has(x)))
  }, [])

  const clearSelection = useCallback(() => setSelectedProductIdsState([]), [])

  const isProductSelected = useCallback(
    (id: string) => selectedProductIds.includes(String(id).trim()),
    [selectedProductIds],
  )

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
