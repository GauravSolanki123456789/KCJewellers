'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Mail, MessageSquare, Phone, XCircle, CheckCircle2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'

export type StorefrontContactMessage = {
  id: number
  sender_name: string
  sender_mobile: string
  sender_email?: string | null
  message: string
  source_domain?: string | null
  status: string
  closed_at?: string | null
  reseller_note?: string | null
  created_at: string
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function StorefrontContactInbox() {
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [messages, setMessages] = useState<StorefrontContactMessage[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const params = filter === 'all' ? {} : { status: filter }
      const res = await axios.get<{ messages: StorefrontContactMessage[]; open_count: number }>(
        '/api/reseller/storefront-contact-messages',
        { params },
      )
      setMessages(res.data.messages || [])
      setOpenCount(Number(res.data.open_count || 0))
    } catch (e) {
      setErr(erpErr(e))
      setMessages([])
    } finally {
      setBusy(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const selected = messages.find((m) => m.id === selectedId) || null

  useEffect(() => {
    setNote(selected?.reseller_note || '')
  }, [selected?.id, selected?.reseller_note])

  const patch = async (id: number, body: { status?: string; reseller_note?: string }) => {
    setSaving(true)
    setErr(null)
    try {
      await axios.patch(`/api/reseller/storefront-contact-messages/${id}`, body)
      await load()
      if (body.status === 'closed') setSelectedId(null)
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setSaving(false)
    }
  }

  const waHref = (mobile: string) => {
    const d = String(mobile || '').replace(/\D/g, '').slice(-10)
    if (d.length !== 10) return null
    return `https://wa.me/91${d}`
  }

  return (
    <div className="space-y-4">
      {openCount > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
            {openCount} open
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['open', 'closed', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`min-h-10 rounded-full px-4 text-xs font-semibold capitalize ${
              filter === f
                ? 'bg-[var(--kc-accent,#9a1c2e)] text-white'
                : 'border border-stone-200 bg-white text-[var(--color-jewelry-black,#1a1814)]'
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <button type="button" className={erpBtnGhost} onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${erpCardCls} max-h-[520px] overflow-y-auto p-0`}>
          {busy && !messages.length ? (
            <p className="flex items-center gap-2 p-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : !messages.length ? (
            <p className="p-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/50">
              No messages in this filter.
            </p>
          ) : (
            <ul className="divide-y divide-stone-200">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition ${
                      selectedId === m.id ? 'bg-amber-50/80' : 'hover:bg-stone-50'
                    }`}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {m.sender_name}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          m.status === 'closed'
                            ? 'bg-stone-200 text-stone-700'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {m.status}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                      {m.message}
                    </span>
                    <span className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
                      {formatWhen(m.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${erpCardCls} min-h-[280px] space-y-4`}>
          {!selected ? (
            <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/50">
              Select a message to reply or close it.
            </p>
          ) : (
            <>
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {selected.sender_name}
                </h2>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{formatWhen(selected.created_at)}</p>
              </div>
              <p className="whitespace-pre-wrap rounded-xl border border-stone-200 bg-[#faf7f2] px-3 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)]">
                {selected.message}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`tel:+91${String(selected.sender_mobile).replace(/\D/g, '').slice(-10)}`}
                  className={`${erpBtnGhost} no-underline`}
                >
                  <Phone className="size-4" /> Call
                </a>
                {waHref(selected.sender_mobile) ? (
                  <a
                    href={waHref(selected.sender_mobile)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${erpBtnGhost} no-underline`}
                  >
                    <MessageSquare className="size-4" /> WhatsApp
                  </a>
                ) : null}
                {selected.sender_email ? (
                  <a href={`mailto:${selected.sender_email}`} className={`${erpBtnGhost} no-underline`}>
                    <Mail className="size-4" /> Email
                  </a>
                ) : null}
              </div>
              <label className="block text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]/55">
                Your note (private)
                <textarea
                  className={`${erpInputCls} mt-1 min-h-[72px]`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Follow-up reminder…"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={erpBtnPrimary}
                  disabled={saving}
                  onClick={() => void patch(selected.id, { reseller_note: note })}
                >
                  Save note
                </button>
                {selected.status !== 'closed' ? (
                  <button
                    type="button"
                    className={erpBtnGhost}
                    disabled={saving}
                    onClick={() => void patch(selected.id, { status: 'closed', reseller_note: note })}
                  >
                    <CheckCircle2 className="size-4 text-emerald-700" />
                    Mark closed
                  </button>
                ) : (
                  <button
                    type="button"
                    className={erpBtnGhost}
                    disabled={saving}
                    onClick={() => void patch(selected.id, { status: 'open' })}
                  >
                    <XCircle className="size-4" />
                    Reopen
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
