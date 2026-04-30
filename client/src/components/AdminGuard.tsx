'use client'

import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { ShieldX, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CATALOG_PATH } from '@/lib/routes'
import { KC_SUPER_ADMIN_EMAIL } from '@/lib/admin-access'

type UserType = { role?: string; email?: string; name?: string }

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const [isChecking, setIsChecking] = useState(true)
  const user = auth.user as UserType | undefined
  const email = (user?.email || '').toLowerCase().trim()
  const role = user?.role || ''
  
  // Check both email and role for admin access
  const isSuperAdmin = email === KC_SUPER_ADMIN_EMAIL || role === 'super_admin' || role === 'admin'

  // Give auth time to load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsChecking(false)
    }, 500) // Wait 500ms for auth to load
    return () => clearTimeout(timer)
  }, [])

  // Debug logging
  useEffect(() => {
    console.log('AdminGuard Debug:', {
      isAuthenticated: auth.isAuthenticated,
      email,
      role,
      isSuperAdmin,
      user: user ? { email: user.email, role: user.role, name: user.name } : null
    })
  }, [auth.isAuthenticated, email, role, isSuperAdmin, user])

  // Show loading state while checking
  if (isChecking && !auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center">
          <Loader2 className="size-16 text-yellow-500 mx-auto mb-4 animate-spin" />
          <h1 className="text-xl font-semibold text-slate-200">Checking authentication...</h1>
        </div>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center">
          <ShieldX className="size-16 text-red-500/80 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-200">Authentication Required</h1>
          <p className="text-slate-500 mt-2">Sign in to access the admin dashboard.</p>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/google`}
            className="mt-6 inline-block px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-semibold rounded-lg"
          >
            Sign In with Google
          </a>
        </div>
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center border-red-500/20">
          <ShieldX className="size-16 text-red-500/80 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-200">Access Denied</h1>
          <p className="text-slate-500 mt-2">Admin access is restricted. Only authorized users can view this area.</p>
          <p className="text-slate-400 text-xs mt-2">Email: {email || 'N/A'} | Role: {role || 'N/A'}</p>
          <Link
            href={CATALOG_PATH}
            className="mt-6 inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    )
  }

  // User is authenticated and is admin - render children
  return <>{children}</>
}
