'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Copy, Loader2, MessageCircle } from 'lucide-react'
import { erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { fetchWhatsAppCloudStatus, type WhatsAppCloudStatus } from '@/lib/erp-whatsapp-cloud'
import { WhatsAppEmbeddedSignupButton } from '@/components/reseller/erp/WhatsAppEmbeddedSignupButton'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
      {label}
      <div className="mt-1 flex gap-2">
        <input
          readOnly
          value={value}
          className={`${erpInputCls} min-w-0 flex-1 font-mono text-[11px]`}
        />
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!value}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-40"
        >
          <Copy className="size-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </label>
  )
}

export function ErpWhatsAppCloudPanel() {
  const [enabled, setEnabled] = useState(true)
  const [displayNumber, setDisplayNumber] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [documentTemplateName, setDocumentTemplateName] = useState('')
  const [documentTemplateLanguage, setDocumentTemplateLanguage] = useState('en')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [status, setStatus] = useState<WhatsAppCloudStatus>({ configured: false })

  const refreshStatus = useCallback(async () => {
    const s = await fetchWhatsAppCloudStatus()
    setStatus(s)
    if (s.displayNumber && !displayNumber) setDisplayNumber(String(s.displayNumber).replace(/\D/g, '').slice(-10))
    if (s.phoneNumberId && !phoneNumberId) setPhoneNumberId(s.phoneNumberId)
    if (s.documentTemplateName && !documentTemplateName) setDocumentTemplateName(s.documentTemplateName)
  }, [displayNumber, phoneNumberId, documentTemplateName])

  useEffect(() => {
    void axios
      .get<{ settings: Record<string, unknown> }>('/api/reseller/erp/settings')
      .then((res) => {
        const block = (res.data.settings?.whatsappCloud as Record<string, unknown>) || {}
        setEnabled(block.enabled !== false && block.enabled !== 'no')
        setDisplayNumber(block.displayNumber != null ? String(block.displayNumber) : '')
        setPhoneNumberId(block.phoneNumberId != null ? String(block.phoneNumberId) : '')
        setAccessToken(block.accessToken != null ? String(block.accessToken) : '')
        setDocumentTemplateName(
          block.documentTemplateName != null ? String(block.documentTemplateName) : '',
        )
        setDocumentTemplateLanguage(
          block.documentTemplateLanguage != null ? String(block.documentTemplateLanguage) : 'en',
        )
      })
      .catch(() => {})
    void refreshStatus()
  }, [refreshStatus])

  const save = async () => {
    setBusy(true)
    setSaved(false)
    try {
      await axios.put('/api/reseller/erp/settings', {
        settings: {
          whatsappCloud: {
            enabled: enabled ? 'yes' : 'no',
            displayNumber: displayNumber.trim(),
            phoneNumberId: phoneNumberId.trim(),
            accessToken: accessToken.trim(),
            documentTemplateName: documentTemplateName.trim() || undefined,
            documentTemplateLanguage: documentTemplateLanguage.trim() || 'en',
            setupMode: 'manual',
          },
        },
      })
      setSaved(true)
      await refreshStatus()
    } catch {
      alert('Could not save WhatsApp settings')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${erpCardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <MessageCircle className="size-4 text-emerald-700" />
          WhatsApp Business
        </p>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            status.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {status.configured ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 sm:p-4">
        <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Meta webhook</p>
        <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
          One callback URL for all shops — paste these in Meta Developer → WhatsApp → Configure webhook.
        </p>
        <div className="mt-3 grid gap-3">
          <CopyField label="Callback URL" value={status.webhookCallbackUrl || ''} />
          <CopyField
            label="Verify token"
            value={
              status.webhookVerifyTokenConfigured
                ? status.webhookVerifyToken || ''
                : '(Set WHATSAPP_WEBHOOK_VERIFY_TOKEN on server)'
            }
          />
        </div>
      </div>

      <WhatsAppEmbeddedSignupButton onConnected={refreshStatus} />

      <details className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5" open>
        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Shop credentials
        </summary>
        <div className="mt-3 space-y-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2.5">
            <input
              type="checkbox"
              className="size-4 accent-emerald-700"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Enable automatic PDF send
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Shop WhatsApp number
              <input
                className={`${erpInputCls} mt-1`}
                placeholder="9169161616"
                value={displayNumber}
                onChange={(e) => setDisplayNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Meta Phone Number ID
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="Phone number ID"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value.trim())}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
              Permanent access token
              <input
                type="password"
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="System user token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Document template name (optional)
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="document_delivery"
                value={documentTemplateName}
                onChange={(e) => setDocumentTemplateName(e.target.value.trim())}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Template language
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="en"
                value={documentTemplateLanguage}
                onChange={(e) => setDocumentTemplateLanguage(e.target.value.trim())}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save WhatsApp settings
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
          </div>
        </div>
      </details>

      {status.configured && status.displayNumber ? (
        <p className="text-xs text-emerald-800">
          Connected · {status.displayNumber}
          {status.verifiedName ? ` · ${status.verifiedName}` : ''}
        </p>
      ) : null}
    </div>
  )
}
