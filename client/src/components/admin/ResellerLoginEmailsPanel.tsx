'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Mail, Plus, Trash2, Link2 } from 'lucide-react'

type LoginEmailRow = {
  id: number
  email: string
  label?: string | null
}

type Props = {
  userId: number
  primaryEmail?: string | null
  /** Called after a duplicate B2C account was merged into this reseller. */
  onAccountsMerged?: () => void
}

export default function ResellerLoginEmailsPanel({
  userId,
  primaryEmail,
  onAccountsMerged,
}: Props) {
  const [rows, setRows] = useState<LoginEmailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [mergeExisting, setMergeExisting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get<{ data?: LoginEmailRow[] }>(
        `/api/admin/users/${userId}/login-emails`,
      )
      setRows(Array.isArray(data?.data) ? data.data : [])
    } catch {
      setRows([])
      setError('Could not load extra login emails')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const handleAdd = async (forceMerge = false) => {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address')
      return
    }
    setAdding(true)
    setError(null)
    setSuccess(null)
    try {
      const { data } = await axios.post<{ data?: { absorbedUserId?: number | null } }>(
        `/api/admin/users/${userId}/login-emails`,
        {
          email,
          label: newLabel.trim() || undefined,
          absorbExistingAccount: forceMerge || mergeExisting,
        },
      )
      setNewEmail('')
      setNewLabel('')
      setMergeExisting(false)
      if (data?.data?.absorbedUserId) {
        setSuccess(
          `Linked ${email} and removed the duplicate B2C account (#${data.data.absorbedUserId}).`,
        )
        onAccountsMerged?.()
      } else {
        setSuccess(`${email} added — Google sign-in will open this reseller account.`)
      }
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Could not add email'
      const errText = msg || 'Could not add email'
      setError(errText)
      if (
        !forceMerge &&
        errText.toLowerCase().includes('already registered as a separate account')
      ) {
        setMergeExisting(true)
      }
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (aliasId: number) => {
    setRemovingId(aliasId)
    setError(null)
    setSuccess(null)
    try {
      await axios.delete(`/api/admin/users/${userId}/login-emails/${aliasId}`)
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Could not remove email'
      setError(msg || 'Could not remove email')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex items-start gap-2.5 mb-3">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
          <Mail className="size-4 text-amber-500" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-200">Extra login emails</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Staff can sign in with Google using any email here — they all open this same reseller
            account ({primaryEmail || 'primary email'}).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : rows.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{row.email}</p>
                {row.label ? (
                  <p className="text-[11px] text-slate-500 truncate">{row.label}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(row.id)}
                disabled={removingId === row.id}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                aria-label={`Remove ${row.email}`}
              >
                {removingId === row.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 mb-3">No extra emails yet — add one below.</p>
      )}

      <div className="space-y-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => {
            setNewEmail(e.target.value)
            setError(null)
            setSuccess(null)
          }}
          placeholder="e.g. hiteshmarlecha07@gmail.com"
          className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          autoComplete="off"
        />
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Optional label (e.g. Hitesh — partner login)"
          className="w-full min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        {mergeExisting ? (
          <label className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-relaxed text-amber-100/90">
            <input
              type="checkbox"
              checked={mergeExisting}
              onChange={(e) => setMergeExisting(e.target.checked)}
              className="mt-0.5 size-4 rounded border-amber-400/50"
            />
            <span>
              This email already has its own B2C KC account. Merge it into this reseller — the
              duplicate row will be removed from B2B clients and Google sign-in will open{' '}
              <strong className="font-semibold text-amber-50">{primaryEmail || 'this brand'}</strong>.
            </span>
          </label>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void handleAdd(false)}
            disabled={adding || !newEmail.trim()}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] rounded-xl border border-amber-500/35 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add login email
          </button>
          {error?.toLowerCase().includes('already registered as a separate account') ? (
            <button
              type="button"
              onClick={() => void handleAdd(true)}
              disabled={adding || !newEmail.trim()}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] rounded-xl border border-violet-500/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Link &amp; remove duplicate account
            </button>
          ) : null}
        </div>
      </div>

      {success ? <p className="mt-2 text-xs text-emerald-400">{success}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </section>
  )
}
