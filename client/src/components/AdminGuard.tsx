'use client'

import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { ShieldX } from 'lucide-react'

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

type UserType = { role?: string; email?: string }

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const user = auth.user as UserType | undefined
  const email = (user?.email || '').toLowerCase().trim()
  const isSuperAdmin = email === SUPER_ADMIN_EMAIL

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md text-center">
          <ShieldX className="size-16 text-red-500/80 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-200">Authentication Required</h1>
          <p className="text-slate-500 mt-2">Sign in to access the admin dashboard.</p>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/auth/google`}
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
          <Link
            href="/"
            className="mt-6 inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-lg"
          >
            Return to Home
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
