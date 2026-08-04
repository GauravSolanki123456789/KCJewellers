'use client'
import axios from "axios"
import { useEffect, useState } from "react"

export type AuthState = {
  isAuthenticated: boolean
  user?: unknown
  /** Effective palette for this session (`kc_theme_id`). */
  kc_theme_id?: string
  /** True after first `/api/auth/current_user` response (success or failure) */
  hasChecked?: boolean
  has_wholesale_access?: boolean
  has_b2b_portal_access?: boolean
}

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000
let authCache: AuthState | null = null
let authCacheAt = 0
let authInflight: Promise<AuthState> | null = null

async function fetchCurrentUser(): Promise<AuthState> {
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
  try {
    const res = await axios.get(`${url}/api/auth/current_user`, { withCredentials: true })
    const next: AuthState = { ...res.data, hasChecked: true }

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

    authCache = next
    authCacheAt = Date.now()
    return next
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 429 && authCache) {
      return { ...authCache, hasChecked: true }
    }
    if (status !== 429) {
      console.error('Auth check error:', err && typeof err === 'object' && 'message' in err ? (err as Error).message : err)
    }
    const failed: AuthState = { isAuthenticated: false, hasChecked: true }
    authCache = failed
    authCacheAt = Date.now()
    return failed
  }
}

function loadAuth(force = false): Promise<AuthState> {
  const fresh = authCache && Date.now() - authCacheAt < AUTH_CACHE_TTL_MS
  if (!force && fresh && authCache) {
    return Promise.resolve(authCache)
  }
  if (!force && authInflight) {
    return authInflight
  }
  authInflight = fetchCurrentUser().finally(() => {
    authInflight = null
  })
  return authInflight
}

/** Invalidate cached auth after login/logout elsewhere. */
export function invalidateAuthCache() {
  authCache = null
  authCacheAt = 0
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() =>
    authCache ? { ...authCache, hasChecked: true } : { isAuthenticated: false, hasChecked: false },
  )

  useEffect(() => {
    let cancelled = false
    void loadAuth().then((next) => {
      if (!cancelled) setAuth(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return auth
}
