'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, MessageCircle } from 'lucide-react'
import { erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { fetchWhatsAppCloudStatus, type WhatsAppCloudStatus } from '@/lib/erp-whatsapp-cloud'
import { WhatsAppEmbeddedSignupButton } from '@/components/reseller/erp/WhatsAppEmbeddedSignupButton'

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <MessageCircle className="size-4 text-emerald-700" />
            WhatsApp Business — automatic PDF send
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            One click in ERP sends the bill PDF to your customer from <strong>your shop number</strong> — no
            WhatsApp app or chat window opens on this PC.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            status.configured
              ? status.coexistenceActive
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {status.configured
            ? status.coexistenceActive
              ? 'Active · phone + API'
              : 'Active'
            : 'Not connected'}
        </span>
      </div>

      <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-3 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/75">
        <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          You do <em>not</em> need to stop using WhatsApp on your phone
        </p>
        <p className="mt-1.5">
          Meta supports <strong>Coexistence</strong>: your existing <strong>WhatsApp Business app</strong>{' '}
          number (e.g. 9169161616) stays active on mobile, and ERP sends PDFs through Cloud API from the same
          number. If you use regular WhatsApp (green app), install <strong>WhatsApp Business</strong> on the
          same number first, then connect below.
        </p>
        <p className="mt-1.5 text-[var(--color-jewelry-black,#1a1814)]/60">
          Regular consumer WhatsApp cannot be linked to API without migrating to WhatsApp Business. Deleting the
          mobile account is only required for API-only setups — not for Coexistence.
        </p>
      </div>

      <WhatsAppEmbeddedSignupButton onConnected={refreshStatus} />

      <details className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Manual setup (Meta Developer credentials)
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
              Shop WhatsApp number (display)
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
                placeholder="From Meta Developer → WhatsApp → API Setup"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value.trim())}
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60 sm:col-span-2">
              Permanent access token
              <input
                type="password"
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="System user token with whatsapp_business_messaging"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Document template name (optional)
              <input
                className={`${erpInputCls} mt-1 font-mono text-xs`}
                placeholder="e.g. document_delivery"
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

          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-[var(--color-jewelry-black,#1a1814)]/70">
            <li>
              Prefer <strong>Connect my shop WhatsApp</strong> above if available — it keeps your phone app
              active (Coexistence).
            </li>
            <li>
              Or create a Meta app at{' '}
              <a href="https://developers.facebook.com" className="text-emerald-800 underline" target="_blank" rel="noreferrer">
                developers.facebook.com
              </a>{' '}
              → WhatsApp product → enable <strong>WhatsApp Business app onboarding</strong> in Embedded Signup
              config.
            </li>
            <li>
              For customers who have not messaged you in 24 hours, submit an approved{' '}
              <strong>document template</strong> in Meta Business Manager and enter its name above.
            </li>
            <li>Each reseller connects their own number — PDFs always send from that shop&apos;s number.</li>
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save WhatsApp settings
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-600">Saved</span> : null}
          </div>
        </div>
      </details>

      {status.configured ? (
        <p className="text-xs text-emerald-800">
          Connected{status.displayNumber ? ` · ${status.displayNumber}` : ''}
          {status.verifiedName ? ` · ${status.verifiedName}` : ''}
          {status.coexistenceActive ? ' · WhatsApp Business app + Cloud API (Coexistence)' : ''}.
          Bill PDF buttons now send directly — no app opens.
        </p>
      ) : null}
    </div>
  )
}
