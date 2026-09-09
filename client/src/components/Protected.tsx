'use client'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { LOGIN_PATH } from '@/lib/routes'

export default function Protected({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  if (!auth.isAuthenticated) {
    return (
      <div className="p-4">
        <div className="glass-card p-4">
          <div className="text-lg font-semibold">Login Required</div>
          <div className="mt-2 text-sm opacity-80">Please sign in to access this section.</div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => openLoginModal(LOGIN_PATH)}
              className="px-4 py-2 gold-bg text-white rounded min-h-[44px]"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
