'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  resellerApplicationStatusLabel,
  resellerApplicationStatusTone,
  type ResellerApplicationStatus,
} from '@/lib/reseller-invite'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'
import { Loader2, Check, X, Store, Mail, Phone, Globe, MapPin, FileText } from 'lucide-react'

export type ResellerApplicationRow = {
  id: number
  user_id: number
  reseller_invite_code: string
  referred_by_user_id: number | null
  contact_name: string
  business_name: string
  email: string
  mobile_number: string
  city_state: string | null
  desired_custom_domain: string | null
  notes: string | null
  application_status: ResellerApplicationStatus
  created_at: string
  referrer_business_name?: string | null
  referrer_name?: string | null
  referrer_email?: string | null
  referrer_reseller_invite_code?: string | null
  applicant_customer_tier?: string | null
}

type Props = {
  onApproved?: (userId: number) => void
}

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
] as const

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ResellerApplicationsPanel({ onApproved }: Props) {
  const [rows, setRows] = useState<ResellerApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [actingId, setActingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter ? { application_status: filter } : {}
      const res = await axios.get<ResellerApplicationRow[]>('/api/admin/reseller-applications', {
        params,
      })
      setRows(Array.isArray(res.data) ? res.data : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const pendingCount = useMemo(
    () => rows.filter((r) => r.application_status === 'pending').length,
    [rows],
  )

  const approve = async (id: number, userId: number) => {
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-applications/${id}/approve`)
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      onApproved?.(userId)
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Approve failed')
    } finally {
      setActingId(null)
    }
  }

  const reject = async (id: number) => {
    if (!window.confirm('Reject this reseller application?')) return
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-applications/${id}/reject`)
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Reject failed')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Reseller applications</h2>
          <p className="mt-1 text-xs text-slate-500">
            Each row shows which <code className="text-slate-400">reseller_invite_code</code> was
            used and who referred the applicant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key || 'all'}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition touch-manipulation ${
                filter === key
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'border border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-600'
              }`}
            >
              {label}
              {key === 'pending' && filter !== 'pending' && pendingCount > 0 && (
                <span className="ml-1 text-amber-400">({pendingCount})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-8 animate-spin text-violet-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 px-6 py-12 text-center">
          <p className="text-sm text-slate-400">No applications in this filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((app) => {
            const referrer =
              app.referrer_business_name?.trim() ||
              app.referrer_name?.trim() ||
              app.referrer_email?.trim() ||
              (app.referred_by_user_id != null ? `#${app.referred_by_user_id}` : '—')
            const isPending = app.application_status === 'pending'
            const busy = actingId === app.id

            return (
              <li
                key={app.id}
                className="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-4 shadow-lg shadow-black/20 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-100">{app.business_name}</h3>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${resellerApplicationStatusTone(app.application_status)}`}
                      >
                        {resellerApplicationStatusLabel(app.application_status)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">{app.contact_name}</p>

                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/80">
                        Referral
                      </p>
                      <p className="mt-1 text-sm text-slate-200">
                        Code{' '}
                        <span className="font-mono font-semibold text-violet-200">
                          {app.reseller_invite_code}
                        </span>
                        <span className="text-slate-500"> · </span>
                        <span className="inline-flex items-center gap-1">
                          <Store className="size-3.5 text-violet-400" aria-hidden />
                          {referrer}
                        </span>
                      </p>
                    </div>

                    <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Mail className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                        <span className="truncate">{app.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400">
                        <Phone className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                        +91 {app.mobile_number}
                      </div>
                      {app.city_state && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                          {app.city_state}
                        </div>
                      )}
                      {app.desired_custom_domain && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <Globe className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                          {app.desired_custom_domain}
                        </div>
                      )}
                    </dl>

                    {app.notes && (
                      <p className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs leading-relaxed text-slate-400">
                        <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {app.notes}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-600">Applied {formatWhen(app.created_at)}</p>
                  </div>

                  {isPending && (
                    <div className="flex shrink-0 flex-row gap-2 lg:flex-col lg:min-w-[140px]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void approve(app.id, app.user_id)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-md touch-manipulation hover:bg-emerald-500 disabled:opacity-60 lg:flex-none"
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="size-4" aria-hidden />
                            Approve
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reject(app.id)}
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 text-sm font-medium text-rose-300 touch-manipulation hover:bg-rose-500/20 disabled:opacity-60 lg:flex-none"
                      >
                        <X className="size-4" aria-hidden />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
