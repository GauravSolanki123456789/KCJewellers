'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SmsOtpSettingsValues } from '@/components/sms/SmsOtpSettingsPanel'

type Theme = 'admin' | 'reseller'

export type SmsTestOtpResult = {
  success?: boolean
  message?: string
  mobile?: string
  messageId?: string | null
  gatewayResponse?: string | null
  filledMessage?: string | null
  dltTemplate?: string | null
  dltVariables?: string[] | null
  attempt?: string | null
  hint?: string
  cccHint?: string
  error?: string
}

type Props = {
  theme?: Theme
  testApiPath: string
  form: Pick<
    SmsOtpSettingsValues,
    | 'sms_provider'
    | 'o3sms_api_key'
    | 'o3sms_sender_id'
    | 'o3sms_route'
    | 'o3sms_dlt_template_id'
    | 'o3sms_message_template'
  >
  apiKeyReady: boolean
  defaultMobile?: string
}

export default function SmsTestOtpBlock({
  theme = 'reseller',
  testApiPath,
  form,
  apiKeyReady,
  defaultMobile = '',
}: Props) {
  const isAdmin = theme === 'admin'
  const [mobile, setMobile] = useState(defaultMobile.replace(/\D/g, '').slice(-10))
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<SmsTestOtpResult | null>(null)

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

  const canTest = mobile.length === 10 && (apiKeyReady || form.o3sms_api_key.trim().length > 0)

  const handleTest = async () => {
    const digits = mobile.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) return
    setTesting(true)
    setResult(null)
    try {
      const body: Record<string, string> = {
        mobile_number: digits,
        sms_provider: form.sms_provider,
        o3sms_sender_id: form.o3sms_sender_id,
        o3sms_route: form.o3sms_route,
        o3sms_dlt_template_id: form.o3sms_dlt_template_id,
        o3sms_message_template: form.o3sms_message_template,
      }
      if (form.o3sms_api_key.trim()) body.o3sms_api_key = form.o3sms_api_key.trim()
      const res = await axios.post<SmsTestOtpResult>(testApiPath, body, { withCredentials: true })
      setResult(res.data)
    } catch (e: unknown) {
      const data = (e as { response?: { data?: SmsTestOtpResult } })?.response?.data
      setResult({
        error: data?.error || 'Test send failed. Check API key and DLT settings.',
        gatewayResponse: data?.gatewayResponse ?? null,
        filledMessage: data?.filledMessage ?? null,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={cn(cardCls, isAdmin ? 'border-violet-500/25 bg-violet-500/5' : 'border-emerald-600/20 bg-emerald-50/40')}>
      <p
        className={cn(
          'mb-1 text-sm font-semibold',
          isAdmin ? 'text-violet-300' : 'text-[var(--color-jewelry-black,#1a1814)]',
        )}
      >
        Send test OTP
      </p>
      <p className={cn('mb-4 leading-relaxed', hintCls)}>
        Uses the settings above (saved key + current form fields). Gateway response is shown so you
        can fix DLT template / sender issues before customers try.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className={labelCls}>Test mobile</label>
          <div
            className={cn(
              'flex overflow-hidden rounded-xl border',
              isAdmin ? 'border-slate-700 bg-slate-900/60' : 'border-[var(--color-slate-700,#e8e4df)] bg-white',
            )}
          >
            <span
              className={cn(
                'flex items-center border-r px-3 text-sm font-medium',
                isAdmin
                  ? 'border-slate-700 text-slate-400'
                  : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70',
              )}
            >
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="10-digit mobile"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className={cn(
                'min-h-[44px] flex-1 bg-transparent px-3 text-base outline-none',
                isAdmin ? 'text-slate-100' : 'text-[var(--color-jewelry-black,#1a1814)]',
              )}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={testing || !canTest}
          onClick={() => void handleTest()}
          className={cn(
            'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50',
            isAdmin
              ? 'bg-gradient-to-r from-violet-600 to-emerald-600 hover:opacity-90'
              : 'bg-emerald-600 hover:bg-emerald-700',
          )}
        >
          {testing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Send test
        </button>
      </div>

      {!apiKeyReady && !form.o3sms_api_key.trim() ? (
        <p className={cn('mt-3 font-medium text-amber-700', isAdmin && 'text-amber-300')}>
          Paste and save your API key first, or paste it above before testing.
        </p>
      ) : null}

      {result?.success ? (
        <div className="mt-4 space-y-2 rounded-xl border border-emerald-300/60 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-950">
          <p className="font-semibold">{result.message || 'Test OTP sent.'}</p>
          {result.messageId ? (
            <p>
              <span className="font-medium">Gateway message ID:</span> {result.messageId}
            </p>
          ) : null}
          {result.attempt ? (
            <p>
              <span className="font-medium">Method:</span> {result.attempt}
            </p>
          ) : null}
          {result.gatewayResponse ? (
            <p className="break-all">
              <span className="font-medium">Gateway response:</span> {result.gatewayResponse}
            </p>
          ) : null}
          {result.filledMessage ? (
            <p className="break-words">
              <span className="font-medium">Expected SMS on phone:</span> {result.filledMessage}
            </p>
          ) : null}
          {result.dltTemplate ? (
            <p className="break-words">
              <span className="font-medium">DLT template sent to gateway:</span> {result.dltTemplate}
            </p>
          ) : null}
          {result.dltVariables?.length ? (
            <p className="break-words">
              <span className="font-medium">Variables (var1|var2|var3):</span>{' '}
              {result.dltVariables.join(' | ')}
            </p>
          ) : null}
          {result.hint ? <p className="text-emerald-800/80">{result.hint}</p> : null}
          {result.cccHint ? (
            <p className="rounded-lg border border-amber-300/50 bg-amber-50/80 px-2 py-1.5 text-amber-950">
              {result.cccHint}
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.error ? (
        <div className="mt-4 space-y-2 rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-2.5 text-xs text-rose-950">
          <p className="font-semibold">{result.error}</p>
          {result.gatewayResponse ? (
            <p className="break-all">
              <span className="font-medium">Gateway response:</span> {result.gatewayResponse}
            </p>
          ) : null}
          {result.filledMessage ? (
            <p className="break-words">
              <span className="font-medium">Attempted SMS text:</span> {result.filledMessage}
            </p>
          ) : null}
          <p className="text-rose-800/80">
            Common fixes: use exact DLT template ID from Co3, match message character-for-character
            (no extra full stops), sender ID must be approved (e.g. BMSSIL).
          </p>
        </div>
      ) : null}
    </div>
  )
}
