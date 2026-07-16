'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { ArrowLeft, Loader2, MessageSquare, Save, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

type SmsSettings = {
  sms_provider: string
  shared_catalog_otp_enabled: boolean
  fast2sms_api_key: string
  fast2sms_api_key_set: boolean
  o3sms_api_key: string
  o3sms_api_key_set: boolean
  o3sms_sender_id: string
  o3sms_route: string
  o3sms_dlt_template_id: string
  o3sms_message_template: string
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
  { value: '', label: 'Auto (Co3SMS if key set, else Fast2SMS, else MSG91)' },
  { value: 'o3sms', label: 'Co3SMS / O3SMS (api.co3.live)' },
  { value: 'fast2sms', label: 'Fast2SMS' },
  { value: 'msg91', label: 'MSG91' },
  { value: 'twilio', label: 'Twilio' },
]

const O3SMS_ROUTES = [
  { value: '1', label: '1 — Promotional' },
  { value: '2', label: '2 — Transactional (OTP)' },
  { value: '3', label: '3 — Service Implicit' },
  { value: '4', label: '4 — Service Explicit' },
]

function SmsSettingsForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    sms_provider: 'o3sms',
    shared_catalog_otp_enabled: true,
    o3sms_api_key: '',
    o3sms_sender_id: 'ALERTS',
    o3sms_route: '2',
    o3sms_dlt_template_id: '',
    o3sms_message_template: 'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.',
    fast2sms_api_key: '',
    msg91_auth_key: '',
    msg91_sender_id: 'KCJEWL',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
  })
  const [flags, setFlags] = useState({
    o3sms_api_key_set: false,
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
        sms_provider: d.sms_provider || (d.o3sms_api_key_set ? 'o3sms' : ''),
        shared_catalog_otp_enabled: d.shared_catalog_otp_enabled !== false,
        o3sms_api_key: '',
        o3sms_sender_id: d.o3sms_sender_id || 'ALERTS',
        o3sms_route: d.o3sms_route || '2',
        o3sms_dlt_template_id: d.o3sms_dlt_template_id || '',
        o3sms_message_template:
          d.o3sms_message_template ||
          'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.',
        fast2sms_api_key: '',
        msg91_auth_key: '',
        msg91_sender_id: d.msg91_sender_id || 'KCJEWL',
        twilio_account_sid: '',
        twilio_auth_token: '',
        twilio_phone_number: d.twilio_phone_number || '',
      })
      setFlags({
        o3sms_api_key_set: !!d.o3sms_api_key_set,
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
      const body: Record<string, string | boolean> = {
        sms_provider: form.sms_provider,
        shared_catalog_otp_enabled: form.shared_catalog_otp_enabled,
        o3sms_sender_id: form.o3sms_sender_id,
        o3sms_route: form.o3sms_route,
        o3sms_dlt_template_id: form.o3sms_dlt_template_id,
        o3sms_message_template: form.o3sms_message_template,
        msg91_sender_id: form.msg91_sender_id,
        twilio_phone_number: form.twilio_phone_number,
      }
      if (form.o3sms_api_key.trim()) body.o3sms_api_key = form.o3sms_api_key.trim()
      if (form.fast2sms_api_key.trim()) body.fast2sms_api_key = form.fast2sms_api_key.trim()
      if (form.msg91_auth_key.trim()) body.msg91_auth_key = form.msg91_auth_key.trim()
      if (form.twilio_account_sid.trim()) body.twilio_account_sid = form.twilio_account_sid.trim()
      if (form.twilio_auth_token.trim()) body.twilio_auth_token = form.twilio_auth_token.trim()

      await axios.patch('/api/admin/sms-settings', body, { withCredentials: true })
      setSuccess(
        form.shared_catalog_otp_enabled
          ? 'SMS settings saved. Shared catalogue will require OTP verification.'
          : 'SMS settings saved. Shared catalogue will collect mobile only (no OTP).',
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
              Paste your Co3SMS API key here for shared catalogue and site OTP login.
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
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-200">Shared catalogue OTP</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    When off, customers enter mobile only on shared links — no SMS OTP until your
                    gateway is ready. Mobile is still saved on inquiries for WhatsApp follow-up.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.shared_catalog_otp_enabled}
                  aria-label="Require OTP on shared catalogue"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      shared_catalog_otp_enabled: !f.shared_catalog_otp_enabled,
                    }))
                  }
                  className={cn(
                    'relative inline-flex h-11 w-[3.25rem] shrink-0 items-center rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400',
                    form.shared_catalog_otp_enabled
                      ? 'border-emerald-500/60 bg-emerald-600/30'
                      : 'border-slate-600 bg-slate-800',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block size-7 rounded-full bg-white shadow transition-transform',
                      form.shared_catalog_otp_enabled ? 'translate-x-[1.35rem]' : 'translate-x-1',
                    )}
                  />
                </button>
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">
                {form.shared_catalog_otp_enabled
                  ? 'OTP required — Send OTP → verify before shortlist'
                  : 'Mobile only — Continue without OTP'}
              </p>
            </div>

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
            </div>

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <MessageSquare className="size-4" aria-hidden />
                Co3SMS / O3SMS (recommended)
              </p>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                Copy the API key from your Co3SMS dashboard → Developer → Http API → API Key.
              </p>
              <label className="mb-1.5 block text-xs text-slate-500">API key</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  flags.o3sms_api_key_set
                    ? 'Key saved — paste new key only to replace'
                    : 'Paste your Co3SMS API key here'
                }
                value={form.o3sms_api_key}
                onChange={(e) => setForm((f) => ({ ...f, o3sms_api_key: e.target.value }))}
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">Sender ID</label>
              <input
                type="text"
                maxLength={6}
                placeholder="ALERTS"
                value={form.o3sms_sender_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, o3sms_sender_id: e.target.value.toUpperCase() }))
                }
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">Route</label>
              <select
                value={form.o3sms_route}
                onChange={(e) => setForm((f) => ({ ...f, o3sms_route: e.target.value }))}
                className={fieldClass}
              >
                {O3SMS_ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">
                DLT template ID (optional — required if Co3 rejects messages)
              </label>
              <input
                type="text"
                placeholder="DLT template ID from your Co3SMS account"
                value={form.o3sms_dlt_template_id}
                onChange={(e) => setForm((f) => ({ ...f, o3sms_dlt_template_id: e.target.value }))}
                className={fieldClass}
              />
              <label className="mb-1.5 mt-3 block text-xs text-slate-500">
                Message template — use {'{#var#}'} where the OTP goes (must match DLT)
              </label>
              <textarea
                rows={2}
                value={form.o3sms_message_template}
                onChange={(e) => setForm((f) => ({ ...f, o3sms_message_template: e.target.value }))}
                className={`${fieldClass} min-h-[72px] resize-y py-2.5`}
              />
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-amber-400">Fast2SMS (alternate)</p>
              <label className="mb-1.5 block text-xs text-slate-500">API key</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  flags.fast2sms_api_key_set ? 'Key saved — enter new value to replace' : 'FAST2SMS API key'
                }
                value={form.fast2sms_api_key}
                onChange={(e) => setForm((f) => ({ ...f, fast2sms_api_key: e.target.value }))}
                className={fieldClass}
              />
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <p className="mb-3 text-sm font-semibold text-cyan-400">MSG91 (alternate)</p>
              <label className="mb-1.5 block text-xs text-slate-500">Auth key</label>
              <input
                type="password"
                autoComplete="off"
                placeholder={
                  flags.msg91_auth_key_set ? 'Key saved — enter new value to replace' : 'MSG91 auth key'
                }
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
