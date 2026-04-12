'use client'
import axios from "axios"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export type AuthState = {
  isAuthenticated: boolean
  user?: unknown
  /** True after first `/api/auth/current_user` response (success or failure) */
  hasChecked?: boolean
  has_wholesale_access?: boolean
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, hasChecked: false })
  const pathname = usePathname()

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/auth/current_user`, { withCredentials: true })
        setAuth({ ...res.data, hasChecked: true })

        // Check for auth success/error in URL params (read from window to avoid useSearchParams Suspense requirement)
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const authStatus = params.get('auth')
          if (authStatus === 'success') {
            const email = params.get('email')
            const role = params.get('role')
            const name = params.get('name')
            if (email || name) {
              const newUrl = new URL(window.location.href)
              newUrl.searchParams.delete('auth')
              newUrl.searchParams.delete('email')
              newUrl.searchParams.delete('role')
              newUrl.searchParams.delete('name')
              window.history.replaceState({}, '', newUrl.toString())
            }
          } else if (authStatus === 'failed') {
            const reason = params.get('reason')
            console.error(`❌ Login failed: ${reason || 'Unknown error'}`)
          }
        }
      } catch (err: unknown) {
        console.error('Auth check error:', err && typeof err === 'object' && 'message' in err ? (err as Error).message : err)
        setAuth({ isAuthenticated: false, hasChecked: true })
      }
    }
    load()
  }, [pathname])

  return auth
}
