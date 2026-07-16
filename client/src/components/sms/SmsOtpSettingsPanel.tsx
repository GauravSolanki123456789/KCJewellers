'use client'

import { Loader2, MessageSquare, Save, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import SmsTestOtpBlock from '@/components/sms/SmsTestOtpBlock'

export type SmsOtpSettingsValues = {
  shared_catalog_otp_enabled: boolean
  sms_provider: string
  o3sms_api_key: string
  o3sms_sender_id: string
  o3sms_route: string
  o3sms_dlt_template_id: string
  o3sms_message_template: string
}

export type SmsOtpSettingsFlags = {
  o3sms_api_key_set: boolean
}

type Theme = 'admin' | 'reseller'

const O3SMS_ROUTES = [
  { value: '1', label: '1 — Promotional' },
  { value: '2', label: '2 — Transactional (OTP)' },
  { value: '3', label: '3 — Service Implicit' },
  { value: '4', label: '4 — Service Explicit' },
]

/** Must match DLT / Co3 portal exactly — no extra punctuation vs approved template. */
const DEFAULT_TEMPLATE =
  'Dear {#var#} Your OTP for login is {#var#} It is valid for {#var#} B.N.MARLECHA AND SONS'

type Props = {
  theme?: Theme
  form: SmsOtpSettingsValues
  flags: SmsOtpSettingsFlags
  onChange: (patch: Partial<SmsOtpSettingsValues>) => void
  onSave?: () => void
  saving?: boolean
  showSaveButton?: boolean
  intro?: string
  testApiPath?: string
  testDefaultMobile?: string
}

export function emptySmsOtpForm(): SmsOtpSettingsValues {
  return {
    shared_catalog_otp_enabled: false,
    sms_provider: 'o3sms',
    o3sms_api_key: '',
    o3sms_sender_id: 'ALERTS',
    o3sms_route: '2',
    o3sms_dlt_template_id: '',
    o3sms_message_template: DEFAULT_TEMPLATE,
  }
}

export default function SmsOtpSettingsPanel({
  theme = 'reseller',
  form,
  flags,
  onChange,
  onSave,
  saving = false,
  showSaveButton = true,
  intro,
  testApiPath,
  testDefaultMobile,
}: Props) {
  const isAdmin = theme === 'admin'
  const cardCls = isAdmin
    ? 'rounded-xl border border-slate-800 bg-slate-900/40 p-4'
    : 'rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 sm:p-5'
  const labelCls = isAdmin
    ? 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'
    : 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55'
  const inputCls = isAdmin
    ? 'min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900/60 px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20'
    : 'min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/25'
  const hintCls = isAdmin ? 'text-xs text-slate-500' : 'text-xs text-[var(--color-jewelry-black,#1a1814)]/55'

  return (
    <div className="space-y-5">
      {intro ? <p className={cn('text-sm leading-relaxed', hintCls)}>{intro}</p> : null}

      <div
        className={cn(
          cardCls,
          isAdmin ? 'border-amber-500/25 bg-amber-500/5' : 'border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/5',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'flex items-center gap-2 text-sm font-semibold',
                isAdmin ? 'text-amber-200' : 'text-[var(--color-jewelry-black,#1a1814)]',
              )}
            >
              <Smartphone className="size-4 shrink-0 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
              Shared catalogue OTP
            </p>
            <p className={cn('mt-1 text-xs leading-relaxed', hintCls)}>
              When on, customers on your shared links verify mobile with SMS OTP. When off, they enter
              mobile only — inquiries still save for WhatsApp follow-up.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.shared_catalog_otp_enabled}
            aria-label="Require OTP on shared catalogue"
            onClick={() => onChange({ shared_catalog_otp_enabled: !form.shared_catalog_otp_enabled })}
            className={cn(
              'relative inline-flex h-11 w-[3.25rem] shrink-0 items-center rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              form.shared_catalog_otp_enabled
                ? 'border-emerald-500/60 bg-emerald-600/30'
                : isAdmin
                  ? 'border-slate-600 bg-slate-800'
                  : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]',
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
        <p className={cn('mt-3 text-xs font-medium', hintCls)}>
          {form.shared_catalog_otp_enabled
            ? flags.o3sms_api_key_set
              ? 'OTP required — customers receive SMS code'
              : 'OTP on — paste API key below and save'
            : 'Mobile only — Continue without OTP'}
        </p>
      </div>

      <div className={cardCls}>
        <p
          className={cn(
            'mb-1 flex items-center gap-2 text-sm font-semibold',
            isAdmin ? 'text-emerald-400' : 'text-[var(--color-jewelry-black,#1a1814)]',
          )}
        >
          <MessageSquare className="size-4" aria-hidden />
          Co3SMS / O3SMS
        </p>
        <p className={cn('mb-4 text-xs leading-relaxed', hintCls)}>
          API key from Co3SMS dashboard → Developer → Http API. Use your approved DLT template exactly as
          {'registered (placeholders {#var#} or {#alp#}).'}
        </p>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>API key</label>
            <input
              type="password"
              autoComplete="off"
              className={inputCls}
              placeholder={flags.o3sms_api_key_set ? 'Key saved — paste new key only to replace' : 'Paste API key'}
              value={form.o3sms_api_key}
              onChange={(e) => onChange({ o3sms_api_key: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Sender ID</label>
              <input
                className={inputCls}
                placeholder="e.g. BMSSIL"
                maxLength={6}
                value={form.o3sms_sender_id}
                onChange={(e) => onChange({ o3sms_sender_id: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <label className={labelCls}>Route</label>
              <select
                className={inputCls}
                value={form.o3sms_route}
                onChange={(e) => onChange({ o3sms_route: e.target.value })}
              >
                {O3SMS_ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>DLT template ID</label>
            <input
              className={inputCls}
              placeholder="1701160034160122394"
              value={form.o3sms_dlt_template_id}
              onChange={(e) => onChange({ o3sms_dlt_template_id: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>Message template</label>
            <textarea
              className={cn(inputCls, 'min-h-[88px] resize-y py-2.5')}
              value={form.o3sms_message_template}
              onChange={(e) => onChange({ o3sms_message_template: e.target.value })}
            />
            <p className={cn('mt-1.5', hintCls)}>
              Copy the DLT-approved text exactly from Co3 — same spelling, spaces, and punctuation. OTP
              replaces placeholders in order: Customer → code → validity (e.g. 10 minutes).
            </p>
            {/\{#(?:var|alp)#\}\./i.test(form.o3sms_message_template) ? (
              <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-900">
                Warning: your template has full stops after placeholders. If DLT was approved without
                them, SMS will not arrive — remove extra &quot;.&quot; to match Co3 exactly.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {testApiPath ? (
        <SmsTestOtpBlock
          theme={theme}
          testApiPath={testApiPath}
          form={form}
          apiKeyReady={flags.o3sms_api_key_set}
          defaultMobile={testDefaultMobile}
        />
      ) : null}

      {showSaveButton && onSave ? (
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className={cn(
            'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-60 sm:w-auto',
            isAdmin
              ? 'bg-gradient-to-r from-violet-600 to-amber-600 hover:opacity-90'
              : 'bg-[var(--kc-accent,#c41e3a)] hover:opacity-90',
          )}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          Save SMS settings
        </button>
      ) : null}
    </div>
  )
}
