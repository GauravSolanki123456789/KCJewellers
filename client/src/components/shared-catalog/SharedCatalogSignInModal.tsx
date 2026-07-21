'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Smartphone, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  COMMON_COUNTRY_DIAL_OPTIONS,
  parseInternationalMobileInput,
  type ParsedMobile,
} from '@/lib/international-mobile'

export type SharedCatalogCustomerIdentity = {
  userId: number
  mobile: string
  name: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: (identity: SharedCatalogCustomerIdentity) => void
  /** When false, customers enter mobile only — no OTP step. */
  otpEnabled?: boolean
  /** Brochure UUID — uses creator's SMS credentials when sending OTP. */
  catalogUuid?: string
}

function sanitizeAuthError(raw: unknown): string {
  const msg =
    (raw as { response?: { data?: { error?: string } } })?.response?.data?.error ||
    (raw instanceof Error ? raw.message : null) ||
    'Something went wrong. Try again.'
  const s = String(msg)
  if (/<html|<!doctype/i.test(s)) {
    return 'Could not send OTP. The seller may need to finish SMS settings, or you can continue with mobile only.'
  }
  return s.length > 280 ? `${s.slice(0, 277)}…` : s
}

export default function SharedCatalogSignInModal({
  open,
  onOpenChange,
  onVerified,
  otpEnabled = true,
  catalogUuid,
}: Props) {
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile')
  const [countryCode, setCountryCode] = useState('91')
  const [customCountryCode, setCustomCountryCode] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const countryOptions = COMMON_COUNTRY_DIAL_OPTIONS
  const isCustomCountry = countryCode === 'custom'
  const effectiveCountryCode = isCustomCountry ? customCountryCode : countryCode
  const selectedCountry = useMemo(
    () => countryOptions.find((c) => c.code === countryCode) ?? countryOptions[0],
    [countryCode, countryOptions],
  )

  const parsedMobile = useMemo(() => {
    if (!effectiveCountryCode.trim() || !mobileNumber.trim()) return null
    const result = parseInternationalMobileInput(effectiveCountryCode, mobileNumber)
    return result.ok ? result.parsed : null
  }, [effectiveCountryCode, mobileNumber])

  const reset = () => {
    setStep('mobile')
    setOtpCode('')
    setError('')
  }

  useEffect(() => {
    if (!open) reset()
  }, [open, otpEnabled])

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const completeSession = (
    user: Record<string, unknown> | undefined,
    parsed: ParsedMobile,
  ) => {
    const userId = Number(user?.id)
    const verifiedMobile = String(user?.mobile_number ?? parsed.stored).replace(/\D/g, '')
    const stored =
      verifiedMobile.length >= 8 ? verifiedMobile : parsed.stored
    const name = String(user?.name ?? `Customer ${stored.slice(-4)}`)
    if (!Number.isFinite(userId) || stored.length < 8) {
      throw new Error('Sign-in succeeded but session is incomplete. Try again.')
    }
    onVerified({ userId, mobile: stored, name })
    reset()
    onOpenChange(false)
  }

  const registerMobile = async (parsed: ParsedMobile) => {
    const res = await axios.post(
      '/api/auth/register-mobile',
      {
        mobile_number: parsed.national,
        country_code: parsed.countryCode,
      },
      { withCredentials: true },
    )
    completeSession(res.data?.user as Record<string, unknown> | undefined, parsed)
  }

  const handleMobileSubmit = async () => {
    const result = parseInternationalMobileInput(effectiveCountryCode, mobileNumber)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const parsed = result.parsed
    setError('')
    setLoading(true)
    try {
      const useOtp = otpEnabled && parsed.isIndian
      if (useOtp) {
        const otpUrl = catalogUuid
          ? `/api/shared-catalog/${encodeURIComponent(catalogUuid)}/send-otp`
          : '/api/auth/send-otp'
        await axios.post(
          otpUrl,
          { mobile_number: parsed.national, country_code: parsed.countryCode },
          { withCredentials: true },
        )
        setStep('otp')
        setOtpCode('')
      } else {
        await registerMobile(parsed)
      }
    } catch (err: unknown) {
      setError(sanitizeAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const result = parseInternationalMobileInput(effectiveCountryCode, mobileNumber)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const parsed = result.parsed
    const otp = otpCode.trim()
    if (!parsed.isIndian || otp.length < 4) {
      setError('Enter the 6-digit OTP')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await axios.post(
        '/api/auth/verify-otp',
        { mobile_number: parsed.national, otp_code: otp },
        { withCredentials: true },
      )
      completeSession(res.data?.user as Record<string, unknown> | undefined, parsed)
    } catch (err: unknown) {
      setError(sanitizeAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const mobileReady = !!parsedMobile
  const intlHint =
    otpEnabled && parsedMobile && !parsedMobile.isIndian
      ? 'International numbers are verified instantly — SMS OTP is only sent for Indian (+91) mobiles.'
      : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <ShieldCheck className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
            {otpEnabled && step === 'otp' ? 'Verify OTP' : 'Verify mobile'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {step === 'mobile' || !otpEnabled ? (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="sc-country"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55"
                >
                  Country
                </label>
                <select
                  id="sc-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-base outline-none focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/30"
                >
                  {countryOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.label} (+{c.code})
                    </option>
                  ))}
                  <option value="custom">Other country…</option>
                </select>
              </div>

              {isCustomCountry ? (
                <div>
                  <label
                    htmlFor="sc-custom-cc"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55"
                  >
                    Country code
                  </label>
                  <div className="flex overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white focus-within:ring-2 focus-within:ring-[var(--kc-accent,#c41e3a)]/30">
                    <span className="flex items-center border-r border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
                      +
                    </span>
                    <input
                      id="sc-custom-cc"
                      type="tel"
                      inputMode="numeric"
                      placeholder="e.g. 971"
                      maxLength={4}
                      value={customCountryCode}
                      onChange={(e) =>
                        setCustomCountryCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      className="min-h-[48px] flex-1 bg-transparent px-3 text-base outline-none"
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="sc-mobile"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55"
                >
                  Mobile number
                </label>
                <div className="flex overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white focus-within:ring-2 focus-within:ring-[var(--kc-accent,#c41e3a)]/30">
                  <span className="flex items-center border-r border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm font-medium tabular-nums text-[var(--color-jewelry-black,#1a1814)]/70">
                    +{effectiveCountryCode || '—'}
                  </span>
                  <input
                    id="sc-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={
                      isCustomCountry ? 'Mobile without country code' : selectedCountry.placeholder
                    }
                    maxLength={isCustomCountry ? 14 : selectedCountry.maxLength}
                    value={mobileNumber}
                    onChange={(e) =>
                      setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 14))
                    }
                    className="min-h-[48px] flex-1 bg-transparent px-3 text-base outline-none"
                  />
                </div>
              </div>

              {intlHint ? (
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900">
                  {intlHint}
                </p>
              ) : null}

              <button
                type="button"
                disabled={loading || !mobileReady}
                onClick={handleMobileSubmit}
                className={cn(
                  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition active:scale-[0.99]',
                  loading || !mobileReady
                    ? 'cursor-not-allowed bg-neutral-300'
                    : 'bg-[var(--kc-accent,#c41e3a)] hover:opacity-90',
                )}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Smartphone className="size-4" aria-hidden />
                )}
                {otpEnabled && parsedMobile?.isIndian
                  ? 'Send OTP'
                  : otpEnabled && parsedMobile && !parsedMobile.isIndian
                    ? 'Continue'
                    : otpEnabled
                      ? 'Send OTP'
                      : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
                OTP sent to{' '}
                <span className="font-semibold tabular-nums">
                  {parsedMobile?.display ?? `+91 ${mobileNumber}`}
                </span>
              </p>
              <div>
                <label
                  htmlFor="sc-otp"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55"
                >
                  Enter OTP
                </label>
                <input
                  id="sc-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="min-h-[48px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-center text-lg font-semibold tracking-[0.35em] outline-none focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/30"
                />
              </div>
              <button
                type="button"
                disabled={loading || otpCode.trim().length < 4}
                onClick={handleVerifyOtp}
                className={cn(
                  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition active:scale-[0.99]',
                  loading || otpCode.trim().length < 4
                    ? 'cursor-not-allowed bg-neutral-300'
                    : 'bg-[var(--kc-accent,#c41e3a)] hover:opacity-90',
                )}
              >
                {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Verify &amp; continue
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setStep('mobile')
                  setOtpCode('')
                  setError('')
                }}
                className="w-full min-h-[40px] text-sm font-medium text-[var(--kc-accent,#c41e3a)] hover:underline"
              >
                Change mobile number
              </button>
            </div>
          )}

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
