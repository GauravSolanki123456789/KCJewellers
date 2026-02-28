'use client'
import axios from "axios"
import { useEffect, useState } from "react"

export type AuthState = { isAuthenticated: boolean, user?: unknown }

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false })
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
    const load = async () => {
      try {
        const res = await axios.get(`${url}/api/auth/current_user`, { withCredentials: true })
        setAuth(res.data)
      } catch {
        setAuth({ isAuthenticated: false })
      }
    }
    load()
  }, [])
  return auth
}
