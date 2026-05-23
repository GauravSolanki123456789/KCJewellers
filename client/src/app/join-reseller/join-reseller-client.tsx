'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import axios from '@/lib/axios'
import { HOME_PATH, PROFILE_PATH } from '@/lib/routes'
import { normalizeResellerInviteCode } from '@/lib/reseller-invite'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Shield,
  Sparkles,
  Store,
  UserPlus,
} from 'lucide-react'

type ReferrerInfo = {
  business_name: string | null
  name: string | null
}

type FormState = {
  reseller_invite_code: string
  contact_name: string
  business_name: string
  email: string
  mobile_number: string
  city_state: string
  desired_custom_domain: string
  notes: string
}

const EMPTY_FORM: FormState = {
  reseller_invite_code: '',
  contact_name: '',
  business_name: '',
  email: '',
  mobile_number: '',
  city_state: '',
  desired_custom_domain: '',
  notes: '',
}

function JoinResellerForm() {
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams.get('code') || searchParams.get('reseller_invite_code') || ''

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    reseller_invite_code: normalizeResellerInviteCode(codeFromUrl),
  }))
  const [referrer, setReferrer] = useState<ReferrerInfo | null>(null)
  const [codeValid, setCodeValid] = useState<boolean | null>(null)
  const [codeChecking, setCodeChecking] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const validateCode = useCallback(async (raw: string) => {
    const code = normalizeResellerInviteCode(raw)
    if (!code) {
      setCodeValid(null)
      setReferrer(null)
      setCodeError(null)
      return
    }
    setCodeChecking(true)
    setCodeError(null)
    try {
      const res = await axios.get<{
        valid: boolean
        error?: string
        referrer?: ReferrerInfo
      }>('/api/public/reseller-invite/validate', {
        params: { code },
      })
      if (res.data.valid) {
        setCodeValid(true)
        setReferrer(res.data.referrer ?? null)
        setCodeError(null)
      } else {
        setCodeValid(false)
        setReferrer(null)
        setCodeError(res.data.error || 'Invalid invite code')
      }
    } catch {
      setCodeValid(false)
      setReferrer(null)
      setCodeError('Could not verify invite code')
    } finally {
      setCodeChecking(false)
    }
  }, [])

  useEffect(() => {
    const normalized = normalizeResellerInviteCode(codeFromUrl)
    if (normalized) {
      setForm((f) => ({ ...f, reseller_invite_code: normalized }))
      void validateCode(normalized)
    }
  }, [codeFromUrl, validateCode])

  useEffect(() => {
    const code = form.reseller_invite_code
    if (!code || code === normalizeResellerInviteCode(codeFromUrl)) return
    const t = window.setTimeout(() => {
      void validateCode(code)
    }, 400)
    return () => window.clearTimeout(t)
  }, [form.reseller_invite_code, codeFromUrl, validateCode])

  const referrerLabel = useMemo(() => {
    if (!referrer) return null
    return referrer.business_name?.trim() || referrer.name?.trim() || null
  }, [referrer])

  const setField = (key: keyof FormState, value: string) => {
    setForm((f) => ({
      ...f,
      [key]: key === 'reseller_invite_code' ? normalizeResellerInviteCode(value) : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!codeValid) {
      setSubmitError('Enter a valid reseller invite code')
      return
    }
    setSubmitting(true)
    try {
      await axios.post('/api/public/reseller-applications', {
        reseller_invite_code: form.reseller_invite_code,
        contact_name: form.contact_name.trim(),
        business_name: form.business_name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile_number: form.mobile_number.replace(/\D/g, '').slice(-10),
        city_state: form.city_state.trim() || undefined,
        desired_custom_domain: form.desired_custom_domain.trim() || undefined,
        notes: form.notes.trim() || undefined,
      })
      setSuccess(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setSubmitError(msg || 'Could not submit application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <div className="glass-card rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] to-slate-900/80 p-6 text-center sm:p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15">
            <CheckCircle2 className="size-8 text-emerald-400" aria-hidden />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-50 sm:text-2xl">Application received</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Thank you! KC Jewellers will review your application and contact you for domain setup
            and catalogue access.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Sign in with <span className="text-slate-300">{form.email}</span> to track status in
            Profile.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href={PROFILE_PATH}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-sm font-semibold text-white shadow-lg touch-manipulation"
            >
              Go to Profile
            </Link>
            <Link
              href={HOME_PATH}
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/15 px-5 text-sm font-medium text-slate-300 touch-manipulation hover:bg-white/5"
            >
              Browse catalogue
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-28 sm:py-12 sm:pb-16">
      <Link
        href={HOME_PATH}
        className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-amber-400"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to catalogue
      </Link>

      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-300">
          <Sparkles className="size-3.5" aria-hidden />
          Reseller programme
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
          Apply as a reseller
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          Get your own white-label jewellery catalogue — share products via WhatsApp and web links.
          Enter the invite code from an existing KC reseller partner.
        </p>
      </div>

      {referrerLabel && codeValid && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] px-4 py-3">
          <Store className="mt-0.5 size-5 shrink-0 text-violet-400" aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-300/80">
              Referred by
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">{referrerLabel}</p>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="glass-card space-y-5 rounded-2xl border border-white/10 p-5 sm:p-6"
      >
        <div>
          <label htmlFor="reseller_invite_code" className="mb-1.5 block text-xs font-medium text-slate-400">
            Reseller invite code <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <input
              id="reseller_invite_code"
              name="reseller_invite_code"
              autoComplete="off"
              spellCheck={false}
              required
              value={form.reseller_invite_code}
              onChange={(e) => setField('reseller_invite_code', e.target.value)}
              placeholder="e.g. GAURAV-KC"
              className={`w-full min-h-[48px] rounded-xl border bg-slate-950/80 px-4 py-3 font-mono text-sm uppercase tracking-wide text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 ${
                codeValid === false
                  ? 'border-rose-500/50 focus:ring-rose-500/25'
                  : codeValid === true
                    ? 'border-emerald-500/40 focus:ring-emerald-500/20'
                    : 'border-slate-700 focus:border-violet-500/40 focus:ring-violet-500/20'
              }`}
            />
            {codeChecking && (
              <Loader2 className="absolute right-3 top-1/2 size-5 -translate-y-1/2 animate-spin text-slate-500" />
            )}
          </div>
          {codeError && <p className="mt-1.5 text-xs text-rose-400">{codeError}</p>}
          {codeValid && !codeError && (
            <p className="mt-1.5 text-xs text-emerald-400/90">Invite code verified</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="business_name" className="mb-1.5 block text-xs font-medium text-slate-400">
              Business / shop name <span className="text-rose-400">*</span>
            </label>
            <input
              id="business_name"
              required
              value={form.business_name}
              onChange={(e) => setField('business_name', e.target.value)}
              placeholder="Your brand name on the catalogue"
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label htmlFor="contact_name" className="mb-1.5 block text-xs font-medium text-slate-400">
              Your name <span className="text-rose-400">*</span>
            </label>
            <input
              id="contact_name"
              required
              autoComplete="name"
              value={form.contact_name}
              onChange={(e) => setField('contact_name', e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label htmlFor="mobile_number" className="mb-1.5 block text-xs font-medium text-slate-400">
              Mobile (WhatsApp) <span className="text-rose-400">*</span>
            </label>
            <input
              id="mobile_number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              maxLength={14}
              value={form.mobile_number}
              onChange={(e) =>
                setField('mobile_number', e.target.value.replace(/\D/g, '').slice(-10))
              }
              placeholder="10-digit number"
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">
              Email (for Google sign-in) <span className="text-rose-400">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label htmlFor="city_state" className="mb-1.5 block text-xs font-medium text-slate-400">
              City / state
            </label>
            <input
              id="city_state"
              autoComplete="address-level2"
              value={form.city_state}
              onChange={(e) => setField('city_state', e.target.value)}
              placeholder="Optional"
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div>
            <label htmlFor="desired_custom_domain" className="mb-1.5 block text-xs font-medium text-slate-400">
              Desired domain
            </label>
            <input
              id="desired_custom_domain"
              value={form.desired_custom_domain}
              onChange={(e) => setField('desired_custom_domain', e.target.value)}
              placeholder="e.g. myshop.com"
              className="w-full min-h-[48px] rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="notes" className="mb-1.5 block text-xs font-medium text-slate-400">
              Notes for KC admin
            </label>
            <textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Tell us about your business (optional)"
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </div>
        </div>

        {submitError && (
          <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || codeValid === false}
          className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-amber-600 px-4 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <>
              <UserPlus className="size-5" aria-hidden />
              Submit application
            </>
          )}
        </button>

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
          <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Applications are reviewed by KC Jewellers. Domain and catalogue setup is completed after
          approval.
        </p>
      </form>
    </div>
  )
}

export default function JoinResellerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-violet-400" />
        </div>
      }
    >
      <JoinResellerForm />
    </Suspense>
  )
}
