'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import axios from '@/lib/axios'
import Link from 'next/link'
import { ArrowLeft, Loader2, Smartphone } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { PROFILE_PATH } from '@/lib/routes'
import SmsOtpSettingsPanel, {
  emptySmsOtpForm,
  type SmsOtpSettingsFlags,
  type SmsOtpSettingsValues,
} from '@/components/sms/SmsOtpSettingsPanel'

type ApiSettings = SmsOtpSettingsValues & SmsOtpSettingsFlags

function ResellerSmsSettingsForm() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState<SmsOtpSettingsValues>(emptySmsOtpForm())
  const [flags, setFlags] = useState<SmsOtpSettingsFlags>({ o3sms_api_key_set: false })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<ApiSettings>('/api/reseller/sms-settings', { withCredentials: true })
      const d = res.data
      setForm({
        shared_catalog_otp_enabled: d.shared_catalog_otp_enabled === true,
        sms_provider: d.sms_provider || 'o3sms',
        o3sms_api_key: '',
        o3sms_sender_id: d.o3sms_sender_id || 'ALERTS',
        o3sms_route: d.o3sms_route || '2',
        o3sms_dlt_template_id: d.o3sms_dlt_template_id || '',
        o3sms_message_template: d.o3sms_message_template || emptySmsOtpForm().o3sms_message_template,
      })
      setFlags({ o3sms_api_key_set: !!d.o3sms_api_key_set })
    } catch {
      setError('Could not load SMS settings.')
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

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, string | boolean> = {
        shared_catalog_otp_enabled: form.shared_catalog_otp_enabled,
        sms_provider: form.sms_provider,
        o3sms_sender_id: form.o3sms_sender_id,
        o3sms_route: form.o3sms_route,
        o3sms_dlt_template_id: form.o3sms_dlt_template_id,
        o3sms_message_template: form.o3sms_message_template,
      }
      if (form.o3sms_api_key.trim()) body.o3sms_api_key = form.o3sms_api_key.trim()
      await axios.patch('/api/reseller/sms-settings', body, { withCredentials: true })
      setSuccess(
        form.shared_catalog_otp_enabled
          ? 'Saved. Customers on your shared links will receive SMS OTP when configured.'
          : 'Saved. Customers enter mobile only on your shared links.',
      )
      await load()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to save settings.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!auth.hasChecked || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="kc-profile-card rounded-2xl px-6 py-10 text-center">
        <Smartphone className="mx-auto mb-4 size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">Sign in to manage SMS settings.</p>
        <button type="button" onClick={() => openLoginModal('/reseller/sms-settings')} className="kc-btn-theme mt-4 min-h-[44px]">
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
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>
      ) : null}
      <SmsOtpSettingsPanel
        theme="reseller"
        form={form}
        flags={flags}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        onSave={() => void handleSave()}
        saving={saving}
        intro="These settings apply only to your shared catalogue links (WhatsApp brochures). KC main-site login is controlled separately by KC admin."
      />
    </div>
  )
}

export default function ResellerSmsSettingsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]">
      <main className="mx-auto max-w-lg px-4 py-6 kc-pb-mobile-nav md:max-w-xl md:py-8">
        <Link
          href={PROFILE_PATH}
          className="mb-4 inline-flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55 transition hover:text-[var(--kc-accent,#c41e3a)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Profile
        </Link>
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/10 p-2.5">
            <Smartphone className="size-6 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">SMS &amp; OTP</h1>
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">Shared catalogue customer sign-in</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <ResellerSmsSettingsForm />
        </Suspense>
      </main>
    </div>
  )
}
