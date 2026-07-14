'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { ArrowLeft, Loader2, MessageSquare, Save, Smartphone } from 'lucide-react'

type SmsSettings = {
  sms_provider: string
  fast2sms_api_key: string
  fast2sms_api_key_set: boolean
  msg91_auth_key: string
  msg91_auth_key_set: boolean
  msg91_sender_id: string
  twilio_account_sid: string
  twilio_account_sid_set: boolean
  twilio_auth_token: string
  twilio_auth_token_set: boolean
  twilio_phone_number: string
}

const PROVIDERS = [
  { value: '', label: 'Auto (Fast2SMS if key set, else MSG91)' },
  { value: 'fast2sms', label: 'Fast2SMS' },
  { value: 'msg91', label: 'MSG91' },
  { value: 'twilio', label: 'Twilio' },
]

function SmsSettingsForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    sms_provider: '',
    fast2sms_api_key: '',
    msg91_auth_key: '',
    msg91_sender_id: 'KCJEWL',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
  })
  const [flags, setFlags] = useState({
    fast2sms_api_key_set: false,
    msg91_auth_key_set: false,
    twilio_account_sid_set: false,
    twilio_auth_token_set: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<SmsSettings>('/api/admin/sms-settings', { withCredentials: true })
      const d = res.data
      setForm({
        sms_provider: d.sms_provider || '',
        fast2sms_api_key: '',
        msg91_auth_key: '',
        msg91_sender_id: d.msg91_sender_id || 'KCJEWL',
        twilio_account_sid: '',
        twilio_auth_token: '',
        twilio_phone_number: d.twilio_phone_number || '',
      })
      setFlags({
        fast2sms_api_key_set: !!d.fast2sms_api_key_set,
        msg91_auth_key_set: !!d.msg91_auth_key_set,
        twilio_account_sid_set: !!d.twilio_account_sid_set,
        twilio_auth_token_set: !!d.twilio_auth_token_set,
      })
    } catch {
      setError('Failed to load SMS settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, string> = {
        sms_provider: form.sms_provider,
        msg91_sender_id: form.msg91_sender_id,
        twilio_phone_number: form.twilio_phone_number,
      }
      if (form.fast2sms_api_key.trim()) body.fast2sms_api_key = form.fast2sms_api_key.trim()
      if (form.msg91_auth_key.trim()) body.msg91_auth_key = form.msg91_auth_key.trim()
      if (form.twilio_account_sid.trim()) body.twilio_account_sid = form.twilio_account_sid.trim()
      if (form.twilio_auth_token.trim()) body.twilio_auth_token = form.twilio_auth_token.trim()

      await axios.patch('/api/admin/sms-settings', body, { withCredentials: true })
      setSuccess('SMS settings saved. OTP for shared catalog sign-in will use these keys.')
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

  const fieldClass =
    'min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <Link
          href="/admin"
          className="mb-6 inline-flex items-center gap-2 text-slate-400 transition hover:text-amber-500"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Dashboard
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5">
            <Smartphone className="size-6 text-emerald-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">SMS &amp; OTP settings</h1>
            <p className="text-sm text-slate-400">
              Configure OTP delivery for shared catalogue customer sign-in and site login.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : (
          <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                SMS provider
              </label>
              <select
                value={form.sms_provider}
                onChange={(e) => setForm((f) => ({ ...f, sms_provider: e.target.value }))}
                className={fieldClass}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value || 'auto'} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                Environment variables in `.env` are used as fallback when a field is left blank here.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-400">
                <MessageSquare className="size-4" aria-hidden />
                Fast2SMS
              </p>
              <label className="mb-1.5 block text-xs text-slate-500">API key</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={flags.fast2sms_api_key_set ? 'Key saved — enter new value to replace' : 'FAST2SMS API key'}
                value={form.fast2sms_api_key}
                onChange={(e) => setForm((f) => ({ ...f, fast2sms_api_key: e.target.value }))}
                className={fieldClass}
              />
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-cyan-400">MSG91</p>
              <label className="mb-1.5 block text-xs text-slate-500">Auth key</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={flags.msg91_auth_key_set ? 'Key saved — enter new value to replace' : 'MSG91 auth key'}
                value={form.msg91_auth_key}
                onChange={(e) => setForm((f) => ({ ...f, msg91_auth_key: e.target.value }))}
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">Sender ID</label>
              <input
                type="text"
                maxLength={6}
                value={form.msg91_sender_id}
                onChange={(e) => setForm((f) => ({ ...f, msg91_sender_id: e.target.value.toUpperCase() }))}
                className={fieldClass}
              />
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-violet-400">Twilio (optional)</p>
              <label className="mb-1.5 block text-xs text-slate-500">Account SID</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={flags.twilio_account_sid_set ? 'Saved — enter to replace' : 'Account SID'}
                value={form.twilio_account_sid}
                onChange={(e) => setForm((f) => ({ ...f, twilio_account_sid: e.target.value }))}
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">Auth token</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={flags.twilio_auth_token_set ? 'Saved — enter to replace' : 'Auth token'}
                value={form.twilio_auth_token}
                onChange={(e) => setForm((f) => ({ ...f, twilio_auth_token: e.target.value }))}
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">From phone number</label>
              <input
                type="tel"
                placeholder="+1…"
                value={form.twilio_phone_number}
                onChange={(e) => setForm((f) => ({ ...f, twilio_phone_number: e.target.value }))}
                className={fieldClass}
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {success}
              </p>
            ) : null}

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-amber-600 px-4 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Save SMS settings
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function AdminSmsSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
          Loading…
        </div>
      }
    >
      <AdminGuard>
        <SmsSettingsForm />
      </AdminGuard>
    </Suspense>
  )
}
