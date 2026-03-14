'use client'
import axios from "axios"
import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

export type AuthState = { isAuthenticated: boolean, user?: unknown, hasChecked?: boolean }

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, hasChecked: false })
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/auth/current_user`, { withCredentials: true })
        setAuth({ ...res.data, hasChecked: true })
        
        // Check for auth success/error in URL params
        const authStatus = searchParams?.get('auth')
        if (authStatus === 'success') {
          const email = searchParams?.get('email')
          const role = searchParams?.get('role')
          const name = searchParams?.get('name')
          
          // Clean up URL params after showing message
          if (typeof window !== 'undefined') {
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.delete('auth')
            newUrl.searchParams.delete('email')
            newUrl.searchParams.delete('role')
            newUrl.searchParams.delete('name')
            window.history.replaceState({}, '', newUrl.toString())
          }
        } else if (authStatus === 'failed') {
          const reason = searchParams?.get('reason')
          console.error(`❌ Login failed: ${reason || 'Unknown error'}`)
        }
      } catch (err: any) {
        console.error('Auth check error:', err.message, err.response?.data)
        setAuth({ isAuthenticated: false, hasChecked: true })
      }
    }
    load()
    
    // Also reload when pathname changes (e.g., after redirect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])
  
  return auth
}
