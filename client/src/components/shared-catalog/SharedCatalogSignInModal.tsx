'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Smartphone, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SharedCatalogCustomerIdentity = {
  userId: number
  mobile: string
  name: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandLabel: string
  onVerified: (identity: SharedCatalogCustomerIdentity) => void
}

export default function SharedCatalogSignInModal({
  open,
  onOpenChange,
  brandLabel,
  onVerified,
}: Props) {
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile')
  const [mobileNumber, setMobileNumber] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setStep('mobile')
    setOtpCode('')
    setError('')
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSendOtp = async () => {
    const mobile = mobileNumber.replace(/\D/g, '').slice(-10)
    if (mobile.length !== 10) {
      setError('Enter a valid 10-digit mobile number')
      return
    }
    setError('')
    setLoading(true)
    try {
      await axios.post('/api/auth/send-otp', { mobile_number: mobile }, { withCredentials: true })
      setStep('otp')
      setOtpCode('')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to send OTP'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const mobile = mobileNumber.replace(/\D/g, '').slice(-10)
    const otp = otpCode.trim()
    if (mobile.length !== 10 || otp.length < 4) {
      setError('Enter the 6-digit OTP')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await axios.post(
        '/api/auth/verify-otp',
        { mobile_number: mobile, otp_code: otp },
        { withCredentials: true },
      )
      const user = res.data?.user as Record<string, unknown> | undefined
      const userId = Number(user?.id)
      const verifiedMobile = String(user?.mobile_number ?? mobile)
        .replace(/\D/g, '')
        .slice(-10)
      const name = String(user?.name ?? `Customer ${verifiedMobile.slice(-4)}`)
      if (!Number.isFinite(userId) || verifiedMobile.length !== 10) {
        throw new Error('Verification succeeded but session is incomplete. Try again.')
      }
      onVerified({ userId, mobile: verifiedMobile, name })
      reset()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Invalid OTP')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <ShieldCheck className="size-5 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
            Sign in to shortlist
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
            Enter your mobile number so {brandLabel} can follow up on your selection via WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {step === 'mobile' ? (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="sc-mobile"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55"
                >
                  Mobile number
                </label>
                <div className="flex overflow-hidden rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white focus-within:ring-2 focus-within:ring-[var(--kc-accent,#c41e3a)]/30">
                  <span className="flex items-center border-r border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
                    +91
                  </span>
                  <input
                    id="sc-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="10-digit mobile"
                    maxLength={10}
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="min-h-[48px] flex-1 bg-transparent px-3 text-base outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={loading || mobileNumber.replace(/\D/g, '').length !== 10}
                onClick={handleSendOtp}
                className={cn(
                  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition active:scale-[0.99]',
                  loading || mobileNumber.replace(/\D/g, '').length !== 10
                    ? 'cursor-not-allowed bg-neutral-300'
                    : 'bg-[var(--kc-accent,#c41e3a)] hover:opacity-90',
                )}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Smartphone className="size-4" aria-hidden />
                )}
                Send OTP
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
                OTP sent to{' '}
                <span className="font-semibold tabular-nums">
                  +91 {mobileNumber.replace(/\D/g, '').slice(-10)}
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
