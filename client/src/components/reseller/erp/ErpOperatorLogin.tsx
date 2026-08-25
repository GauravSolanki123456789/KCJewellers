'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, LogOut, UserCircle2 } from 'lucide-react'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { erpBtnPrimary, erpInputCls } from '@/components/reseller/erp/erp-ui'

export function ErpOperatorLogin() {
  const { login } = useErpOperator()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Sign-in failed'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-[var(--kc-accent,#c41e3a)]/10 ring-1 ring-[var(--kc-accent,#c41e3a)]/20">
            <Lock className="size-5 text-[var(--kc-accent,#c41e3a)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">ERP sign-in</h1>
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Enter your staff username and password
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Username
            <input
              className={`${erpInputCls} mt-1`}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
            Password
            <input
              className={`${erpInputCls} mt-1`}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>
          ) : null}
          <button type="submit" disabled={busy} className={`${erpBtnPrimary} w-full min-h-[44px]`}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Sign in to ERP'}
          </button>
        </form>
      </div>
    </div>
  )
}

export function ErpOperatorBar() {
  const { operator, logout } = useErpOperator()
  const [busy, setBusy] = useState(false)

  if (!operator) return null

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/60 px-3 py-2 text-xs">
      <UserCircle2 className="size-4 shrink-0 text-[var(--kc-accent,#c41e3a)]" />
      <span className="min-w-0 truncate font-medium text-[var(--color-jewelry-black,#1a1814)]">
        {operator.displayName}
        <span className="ml-1 font-normal text-[var(--color-jewelry-black,#1a1814)]/50">
          ({operator.role === 'admin' ? 'Admin' : 'Staff'})
        </span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void logout().finally(() => setBusy(false))
        }}
        className="ml-auto inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2.5 py-1.5 font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
      >
        <LogOut className="size-3.5" />
        Logout
      </button>
    </div>
  )
}

const DEFAULT_SEQUENCE = 'F9Rs*'

/** Listens for secret key sequence when admin is signed in. */
export function useShadowKeyUnlock(enabled: boolean) {
  const router = useRouter()
  const { operator, shadowUnlocked, unlockShadow } = useErpOperator()
  const bufferRef = useRef('')
  const unlockingRef = useRef(false)

  useEffect(() => {
    if (!enabled || !operator || operator.role !== 'admin' || !operator.shadowAccess || shadowUnlocked) {
      return
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return

      if (e.key === 'Enter') {
        const seq = bufferRef.current
        bufferRef.current = ''
        if (seq.length >= 3 && !unlockingRef.current) {
          unlockingRef.current = true
          void unlockShadow(seq)
            .then(() => router.push('/reseller/erp/jainav'))
            .catch(() => {})
            .finally(() => {
              unlockingRef.current = false
            })
        }
        return
      }

      if (e.key === 'F9') {
        bufferRef.current = 'F9'
        e.preventDefault()
        return
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key
        if (bufferRef.current.length > 32) {
          bufferRef.current = bufferRef.current.slice(-32)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, operator, shadowUnlocked, unlockShadow, router])
}

export function ErpOperatorGate({ children }: { children: React.ReactNode }) {
  const { operator, loading } = useErpOperator()
  useShadowKeyUnlock(!!operator)

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
        Loading ERP…
      </div>
    )
  }

  if (!operator) return <ErpOperatorLogin />
  return <>{children}</>
}

export { DEFAULT_SEQUENCE as DEFAULT_SHADOW_SEQUENCE }
