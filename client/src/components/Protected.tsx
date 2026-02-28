'use client'
import { useAuth } from '@/hooks/useAuth'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export default function Protected({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  if (!auth.isAuthenticated) {
    return (
      <div className="p-4">
        <div className="glass-card p-4">
          <div className="text-lg font-semibold">Login Required</div>
          <div className="mt-2 text-sm opacity-80">Please sign in to access this section.</div>
          <div className="mt-3">
            <a href={`${API_URL}/auth/google`} className="px-4 py-2 gold-bg text-black rounded">Sign In with Google</a>
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
