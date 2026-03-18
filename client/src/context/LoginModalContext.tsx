'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type LoginModalContextType = {
  open: (returnTo?: string) => void
  close: () => void
  isOpen: boolean
  returnTo: string | null
}

const LoginModalContext = createContext<LoginModalContextType | null>(null)

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const open = useCallback((path?: string) => {
    setReturnTo(path || null)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    setReturnTo(null)
  }, [])
  return (
    <LoginModalContext.Provider value={{ open, close, isOpen, returnTo }}>
      {children}
    </LoginModalContext.Provider>
  )
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext)
  if (!ctx) return { open: () => {}, close: () => {}, isOpen: false, returnTo: null }
  return ctx
}
