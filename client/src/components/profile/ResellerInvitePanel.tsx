'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import {
  buildResellerInviteWhatsAppMessage,
  normalizeResellerInviteCode,
  resellerApplicationStatusLabel,
  resellerApplicationStatusTone,
  type ResellerApplicationStatus,
} from '@/lib/reseller-invite'
import { JOIN_RESELLER_PATH, PROFILE_PATH } from '@/lib/routes'
import Link from 'next/link'
import {
  Check,
  Copy,
  Loader2,
  Share2,
  Store,
  UserPlus,
  Clock,
  ChevronRight,
} from 'lucide-react'

type ResellerInviteData = {
  reseller_invite_code: string | null
  share_path: string
  share_url: string
  referral_counts: { pending: number; approved: number; rejected: number; total: number }
  referrals: Array<{
    id: number
    contact_name: string
    business_name: string
    email: string
    mobile_number: string
    application_status: ResellerApplicationStatus
    created_at: string
  }>
}

type ApplicationRow = {
  id: number
  application_status: ResellerApplicationStatus
  reseller_invite_code: string
  contact_name: string
  business_name: string
  created_at: string
  referrer_business_name?: string | null
  referrer_name?: string | null
}

function CopyChip({
  label,
  value,
  mono,
  embedded,
}: {
  label: string
  value: string
  mono?: boolean
  embedded?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={
        embedded
          ? 'rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-3'
          : 'rounded-xl border border-white/10 bg-slate-900/50 p-3'
      }
    >
      <p
        className={`text-[11px] font-medium uppercase tracking-wider ${embedded ? 'text-[var(--color-jewelry-black,#1a1814)]/50' : 'text-slate-500'}`}
      >
        {label}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <p
          className={`min-w-0 flex-1 truncate text-sm ${mono ? 'font-mono uppercase tracking-wide' : ''} ${embedded ? 'text-[var(--color-jewelry-black,#1a1814)]' : 'text-slate-100'}`}
        >
          {value}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className={
            embedded
              ? 'inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)]/40 touch-manipulation'
              : 'inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-200 touch-manipulation'
          }
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/** RESELLER tier — show invite code, share link, WhatsApp, referral list. */
export function ResellerInvitePanel({ embedded = false }: { embedded?: boolean }) {
  const auth = useAuth()
  const { customerTier, tierReady } = useCustomerTier()
  const businessName =
    (auth.user as { business_name?: string | null } | undefined)?.business_name ?? null
  const [data, setData] = useState<ResellerInviteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<ResellerInviteData>('/api/reseller/invite')
      setData(res.data)
    } catch (e: unknown) {
      setData(null)
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not load reseller invite settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!tierReady || customerTier !== CUSTOMER_TIER.RESELLER) return
    void load()
  }, [tierReady, customerTier, load])

  if (!tierReady || customerTier !== CUSTOMER_TIER.RESELLER) return null

  const inviteCode = data?.reseller_invite_code
    ? normalizeResellerInviteCode(data.reseller_invite_code)
    : null
  const shareUrl = data?.share_url || ''
  const waMessage =
    inviteCode && shareUrl
      ? buildResellerInviteWhatsAppMessage({
          inviteCode,
          shareUrl,
          businessName,
        })
      : ''

  return (
    <section className={embedded ? '' : 'mb-6'}>
      <div
        className={
          embedded
            ? 'kc-profile-card overflow-hidden rounded-2xl'
            : 'glass-card overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-amber-500/[0.04]'
        }
      >
        <div
          className={
            embedded
              ? 'border-b border-[var(--color-slate-700,#e8e4df)] px-4 py-3.5'
              : 'border-b border-white/10 px-4 py-4 sm:px-5'
          }
        >
          <div className="flex items-start gap-3">
            <div
              className={
                embedded
                  ? 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-slate-900,#f7f4ef)] ring-1 ring-[var(--color-slate-700,#e8e4df)]'
                  : 'flex size-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/15'
              }
            >
              <Store
                className={`size-5 ${embedded ? 'text-[var(--color-jewelry-black,#1a1814)]/70' : 'text-violet-300'}`}
                aria-hidden
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                className={`text-sm font-semibold ${embedded ? 'text-[var(--color-jewelry-black,#1a1814)]' : 'text-lg text-slate-100'}`}
              >
                Reseller programme
              </h2>
              <p
                className={`mt-0.5 text-xs leading-relaxed ${embedded ? 'text-[var(--color-jewelry-black,#1a1814)]/55' : 'mt-1 text-slate-400'}`}
              >
                Share your invite link so others can apply to become a reseller. KC admin will approve
                and set up their domain.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="size-6 animate-spin text-violet-400" />
            </div>
          ) : error ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
              {error}
            </p>
          ) : !inviteCode ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">Invite code not assigned yet</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Ask KC admin to set your <code className="text-slate-300">reseller_invite_code</code>{' '}
                in B2B clients → Edit reseller.
              </p>
            </div>
          ) : (
            <>
              <CopyChip label="Your invite code" value={inviteCode} mono embedded={embedded} />
              <CopyChip
                label="Share link"
                value={shareUrl || `${JOIN_RESELLER_PATH}?code=${inviteCode}`}
                embedded={embedded}
              />

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <WhatsAppShareButton
                  message={waMessage}
                  label="Share on WhatsApp"
                  className="min-h-[44px] w-full flex-1 sm:w-auto"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!shareUrl) return
                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: 'Join as KC Jewellers reseller',
                          text: waMessage,
                          url: shareUrl,
                        })
                      } else {
                        await navigator.clipboard.writeText(shareUrl)
                      }
                    } catch {
                      /* user cancelled */
                    }
                  }}
                  className={
                    embedded
                      ? 'inline-flex min-h-[44px] w-full flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] transition hover:border-[var(--kc-accent,#c41e3a)]/40 touch-manipulation sm:w-auto'
                      : 'inline-flex min-h-[44px] w-full flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-slate-800/50 px-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 touch-manipulation sm:w-auto'
                  }
                >
                  <Share2 className="size-4" aria-hidden />
                  Share link
                </button>
              </div>
            </>
          )}

          {data && data.referral_counts.total > 0 && (
            <div className="border-t border-white/10 pt-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {data.referral_counts.pending > 0 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                    {data.referral_counts.pending} pending
                  </span>
                )}
                {data.referral_counts.approved > 0 && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    {data.referral_counts.approved} approved
                  </span>
                )}
                {data.referral_counts.rejected > 0 && (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
                    {data.referral_counts.rejected} declined
                  </span>
                )}
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Your referrals
              </p>
              <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {data.referrals.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{r.business_name}</p>
                      <p className="truncate text-xs text-slate-500">{r.contact_name}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${resellerApplicationStatusTone(r.application_status)}`}
                    >
                      {resellerApplicationStatusLabel(r.application_status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Non-reseller who submitted an application — show latest status. */
export function ResellerApplicationStatusPanel() {
  const { customerTier, tierReady } = useCustomerTier()
  const [application, setApplication] = useState<ApplicationRow | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!tierReady || customerTier === CUSTOMER_TIER.RESELLER) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await axios.get<{ application: ApplicationRow | null }>('/api/reseller/application')
        if (!cancelled) setApplication(res.data?.application ?? null)
      } catch {
        if (!cancelled) setApplication(null)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tierReady, customerTier])

  if (!tierReady || customerTier === CUSTOMER_TIER.RESELLER || !loaded || !application) return null

  const referrer =
    application.referrer_business_name?.trim() ||
    application.referrer_name?.trim() ||
    null

  return (
    <section className="mb-6">
      <div className="kc-profile-card rounded-2xl px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-slate-900,#f7f4ef)] ring-1 ring-[var(--color-slate-700,#e8e4df)]">
            <UserPlus className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Reseller application
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${resellerApplicationStatusTone(application.application_status)}`}
              >
                {resellerApplicationStatusLabel(application.application_status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">{application.business_name}</p>
            {referrer && (
              <p className="mt-1 text-xs text-[var(--kc-accent,#c41e3a)]/85">
                Referred via code{' '}
                <span className="font-mono">{application.reseller_invite_code}</span>
                {referrer ? ` · ${referrer}` : ''}
              </p>
            )}
            {application.application_status === 'pending' && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Our team will contact you for domain setup and catalogue access.
              </p>
            )}
            {application.application_status === 'approved' && (
              <Link
                href={PROFILE_PATH}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
              >
                You&apos;re approved — sign out and back in if features don&apos;t appear
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
