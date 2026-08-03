'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import axios from '@/lib/axios'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { PROFILE_PATH } from '@/lib/routes'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'

type PaymentSettings = {
  razorpay_key_id: string
  razorpay_key_id_set: boolean
  razorpay_key_secret: string
  razorpay_key_secret_set: boolean
  payments_configured: boolean
  business_name: string | null
  custom_domain: string | null
}

function PaymentSettingsForm() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const [loading, setLoading] = useState(true)
  const paymentSave = useSaveFeedback()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [keyId, setKeyId] = useState('')
  const [keySecret, setKeySecret] = useState('')
  const [flags, setFlags] = useState({ keyIdSet: false, secretSet: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<PaymentSettings>('/api/reseller/payment-settings', {
        withCredentials: true,
      })
      setKeyId(res.data.razorpay_key_id || '')
      setFlags({
        keyIdSet: res.data.razorpay_key_id_set,
        secretSet: res.data.razorpay_key_secret_set,
      })
      setKeySecret('')
    } catch {
      setError('Could not load payment settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!auth.hasChecked) return
    if (!auth.isAuthenticated) {
      setLoading(false)
      return
    }
    void load()
  }, [auth.hasChecked, auth.isAuthenticated, load])

  const handleSave = () =>
    paymentSave.runSave(async () => {
      setError(null)
      setSuccess(null)
      const body: Record<string, string> = {}
      if (keyId.trim()) body.razorpay_key_id = keyId.trim()
      if (keySecret.trim()) body.razorpay_key_secret = keySecret.trim()
      if (!Object.keys(body).length) {
        setError('Enter Key ID or Secret to update.')
        throw new Error('empty')
      }
      try {
        await axios.patch('/api/reseller/payment-settings', body, { withCredentials: true })
        setSuccess('Payment settings saved. DigiGold / DigiSilver customers can pay online.')
        await load()
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Failed to save settings.'
        setError(msg)
        throw e
      }
    })

  if (!auth.hasChecked || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="kc-profile-card rounded-2xl px-6 py-10 text-center">
        <CreditCard className="mx-auto mb-4 size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">Sign in to manage payment settings.</p>
        <button
          type="button"
          onClick={() => openLoginModal('/reseller/payment-settings')}
          className="kc-btn-theme mt-4 min-h-[44px]"
        >
          Sign in
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      <div className="kc-profile-card space-y-4 rounded-2xl p-4 sm:p-5">
        <div>
          <h2 className="text-base font-bold text-[var(--color-jewelry-black,#1a1814)]">Razorpay</h2>
          <p className="mt-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
            Used for DigiGold &amp; DigiSilver customer payments on your storefront. Payments go to your
            Razorpay account.
          </p>
        </div>

        <label className="block text-sm">
          <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]/80">Key ID</span>
          <input
            type="text"
            className="kc-input mt-1 w-full font-mono text-sm"
            placeholder={flags.keyIdSet ? 'Key saved — paste to replace' : 'rzp_live_… or rzp_test_…'}
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            autoComplete="off"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]/80">Key Secret</span>
          <input
            type="password"
            className="kc-input mt-1 w-full font-mono text-sm"
            placeholder={flags.secretSet ? 'Secret saved — paste new secret only to replace' : '••••••••'}
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
          Get keys from{' '}
          <a
            href="https://dashboard.razorpay.com/app/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Razorpay Dashboard → API Keys
          </a>
          . Keep the secret private — never share it with customers.
        </p>

        <SaveFeedbackButton
          type="button"
          onClick={() => void handleSave()}
          disabled={paymentSave.saving}
          saving={paymentSave.saving}
          saved={paymentSave.saved}
          className="kc-btn-theme flex min-h-[44px] w-full items-center justify-center gap-2 sm:w-auto"
        >
          Save payment settings
        </SaveFeedbackButton>
      </div>
    </div>
  )
}

export default function ResellerPaymentSettingsPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-8">
      <Link
        href={PROFILE_PATH}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-jewelry-black,#1a1814)]/60 hover:text-[var(--kc-accent,#c41e3a)]"
      >
        <ArrowLeft className="size-4" />
        Profile
      </Link>
      <div className="mb-4 flex items-center gap-2">
        <CreditCard className="size-5 text-[var(--kc-accent,#c41e3a)]" />
        <h1 className="text-xl font-bold text-[var(--color-jewelry-black,#1a1814)]">Payment settings</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
        DigiGold &amp; DigiSilver online payments
      </p>
      <Suspense fallback={null}>
        <PaymentSettingsForm />
      </Suspense>
    </div>
  )
}
