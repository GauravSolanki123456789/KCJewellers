'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, X } from 'lucide-react'

function AuthToastContent() {
  const searchParams = useSearchParams()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const authStatus = searchParams?.get('auth')
    if (authStatus === 'success') {
      const email = searchParams?.get('email')
      const name = searchParams?.get('name')
      const role = searchParams?.get('role')
      const isAdmin = role === 'super_admin' || role === 'admin'
      setToast({
        type: 'success',
        message: `Successfully logged in as ${name || email}${isAdmin ? ' (Admin)' : ''}`
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setToast(null)
        if (typeof window !== 'undefined') {
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('auth')
          newUrl.searchParams.delete('email')
          newUrl.searchParams.delete('role')
          newUrl.searchParams.delete('name')
          window.history.replaceState({}, '', newUrl.toString())
        }
        timerRef.current = null
      }, 3500)
    } else if (authStatus === 'failed') {
      const reason = searchParams?.get('reason')
      setToast({
        type: 'error',
        message: `Login failed: ${reason || 'Unknown error'}`
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setToast(null)
        if (typeof window !== 'undefined') {
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('auth')
          newUrl.searchParams.delete('reason')
          window.history.replaceState({}, '', newUrl.toString())
        }
        timerRef.current = null
      }, 5000)
    }
  }, [searchParams])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  if (!toast) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ease-out">
      <div
        className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[300px] max-w-[90vw] ${
          toast.type === 'success'
            ? 'bg-green-500/90 text-white border-green-400'
            : 'bg-red-500/90 text-white border-red-400'
        }`}
      >
        {toast.type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 flex-shrink-0" />
        )}
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={() => {
            setToast(null)
            if (typeof window !== 'undefined') {
              const newUrl = new URL(window.location.href)
              newUrl.searchParams.delete('auth')
              newUrl.searchParams.delete('email')
              newUrl.searchParams.delete('role')
              newUrl.searchParams.delete('name')
              newUrl.searchParams.delete('reason')
              window.history.replaceState({}, '', newUrl.toString())
            }
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function AuthToast() {
  return (
    <Suspense fallback={null}>
      <AuthToastContent />
    </Suspense>
  )
}
