'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type BookRateContextType = {
  open: () => void
  close: () => void
  isOpen: boolean
}

const BookRateContext = createContext<BookRateContextType | null>(null)

export function BookRateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  return (
    <BookRateContext.Provider value={{ open, close, isOpen }}>
      {children}
    </BookRateContext.Provider>
  )
}

export function useBookRate() {
  const ctx = useContext(BookRateContext)
  if (!ctx) return { open: () => {}, close: () => {}, isOpen: false }
  return ctx
}
