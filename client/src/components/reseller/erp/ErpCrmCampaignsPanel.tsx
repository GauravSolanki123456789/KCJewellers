'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  deleteCrmCampaign,
  deleteCrmScheme,
  fetchCrmCampaigns,
  fetchCrmSchemes,
  fetchSchemeStats,
  saveCrmCampaign,
  saveCrmScheme,
  uploadCrmCampaignImage,
  type CrmCampaign,
  type CrmScheme,
  type SchemeStats,
} from '@/lib/erp-crm'
import { appAlert, appConfirm } from '@/lib/app-notice'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { Gift, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react'

const OCCASION_OPTIONS = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'custom', label: 'Custom' },
] as const

const emptyCampaign = (): Partial<CrmCampaign> & { name: string } => ({
  occasion: 'custom',
  name: '',
  message: 'Dear {{name}}, a special offer for you — {{discount}} off with coupon {{coupon}}.',
  discount_pct: 0,
  coupon_code: '',
  uses_per_year: 1,
  is_active: true,
})

export function ErpCrmCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([])
  const [schemes, setSchemes] = useState<CrmScheme[]>([])
  const [stats, setStats] = useState<SchemeStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(emptyCampaign())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [schemeName, setSchemeName] = useState('')
  const [schemeDetails, setSchemeDetails] = useState('')
  const [editingSchemeId, setEditingSchemeId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const [c, s, st] = await Promise.all([
      fetchCrmCampaigns(),
      fetchCrmSchemes(),
      fetchSchemeStats().catch(() => null),
    ])
    setCampaigns(c)
    setSchemes(s)
    setStats(st)
  }, [])

  useEffect(() => {
    void load().catch((e) => appAlert(erpErr(e), 'error'))
  }, [load])

  const saveCampaign = async () => {
    if (!draft.name.trim() || busy) return
    setBusy(true)
    try {
      await saveCrmCampaign(
        {
          ...draft,
          name: draft.name.trim(),
          uses_per_year: draft.uses_per_year === 2 ? 2 : 1,
        },
        editingId || undefined,
      )
      setDraft(emptyCampaign())
      setEditingId(null)
      await load()
      appAlert(editingId ? 'Campaign updated.' : 'Campaign saved.', 'success')
    } catch (e) {
      appAlert(erpErr(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveScheme = async () => {
    if (!schemeName.trim() || busy) return
    setBusy(true)
    try {
      await saveCrmScheme(
        { name: schemeName.trim(), details: schemeDetails, is_active: true },
        editingSchemeId || undefined,
      )
      setSchemeName('')
      setSchemeDetails('')
      setEditingSchemeId(null)
      await load()
      appAlert(editingSchemeId ? 'Scheme updated.' : 'Scheme added.', 'success')
    } catch (e) {
      appAlert(erpErr(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={erpCardCls}>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Sparkles className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
          WhatsApp campaigns
        </p>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
          Birthday / anniversary templates with image, message, discount and a coupon (1 or 2 uses per year).
          Placeholders: {'{{name}}'} {'{{discount}}'} {'{{coupon}}'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            className={erpInputCls}
            value={draft.occasion || 'custom'}
            onChange={(e) => setDraft({ ...draft, occasion: e.target.value })}
          >
            {OCCASION_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className={erpInputCls}
            placeholder="Campaign name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <textarea
            className={`${erpInputCls} min-h-[88px] py-2 sm:col-span-2`}
            placeholder="Message"
            value={draft.message || ''}
            onChange={(e) => setDraft({ ...draft, message: e.target.value })}
          />
          <input
            className={erpInputCls}
            placeholder="Discount %"
            inputMode="decimal"
            value={draft.discount_pct ?? ''}
            onChange={(e) => setDraft({ ...draft, discount_pct: Number(e.target.value) || 0 })}
          />
          <input
            className={erpInputCls}
            placeholder="Coupon code"
            value={draft.coupon_code || ''}
            onChange={(e) => setDraft({ ...draft, coupon_code: e.target.value.toUpperCase() })}
          />
          <select
            className={erpInputCls}
            value={draft.uses_per_year === 2 ? 2 : 1}
            onChange={(e) => setDraft({ ...draft, uses_per_year: Number(e.target.value) })}
          >
            <option value={1}>Coupon: 1 use / year</option>
            <option value={2}>Coupon: 2 uses / year</option>
          </select>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]">
            <input
              type="checkbox"
              className="size-4 accent-[var(--kc-accent,#c41e3a)]"
              checked={draft.is_active !== false}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveCampaign()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {editingId ? 'Update campaign' : 'Save campaign'}
          </button>
          {editingId ? (
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                setEditingId(null)
                setDraft(emptyCampaign())
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
        <ul className="mt-4 space-y-2">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {c.name}
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    {c.occasion}
                  </span>
                </p>
                <p className="line-clamp-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/65">{c.message}</p>
                <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                  {c.discount_pct ? `${c.discount_pct}% off` : 'No discount'}
                  {c.coupon_code ? ` · ${c.coupon_code} (${c.uses_per_year}/year)` : ''}
                  {c.is_active ? '' : ' · paused'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  <ImagePlus className="size-3.5" />
                  Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      void uploadCrmCampaignImage(c.id, f)
                        .then(() => load())
                        .then(() => appAlert('Image added.', 'success'))
                        .catch((err) => appAlert(erpErr(err), 'error'))
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={erpBtnGhost}
                  onClick={() => {
                    setEditingId(c.id)
                    setDraft({
                      occasion: c.occasion,
                      name: c.name,
                      message: c.message,
                      discount_pct: c.discount_pct,
                      coupon_code: c.coupon_code || '',
                      uses_per_year: c.uses_per_year,
                      is_active: c.is_active,
                    })
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700"
                  onClick={() => {
                    void appConfirm('Delete this campaign?').then((ok) => {
                      if (!ok) return
                      void deleteCrmCampaign(c.id)
                        .then(() => load())
                        .then(() => appAlert('Campaign deleted.', 'success'))
                    })
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={erpCardCls}>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Gift className="mr-1 inline size-4 text-[var(--kc-accent,#c41e3a)]" />
          Savings schemes
        </p>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
          Admin enters schemes. Staff tick which ones they explained, who is interested, and who joined — no page refresh.
        </p>
        {stats ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Explained
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {stats.totals.explained}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Interested
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {stats.totals.interested}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Joined
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {stats.totals.joined}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Join rate
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                {stats.join_rate_pct}%
              </p>
            </div>
          </div>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className={erpInputCls}
            placeholder="Scheme name (e.g. Gold monthly)"
            value={schemeName}
            onChange={(e) => setSchemeName(e.target.value)}
          />
          <input
            className={erpInputCls}
            placeholder="Details (optional)"
            value={schemeDetails}
            onChange={(e) => setSchemeDetails(e.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void saveScheme()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editingSchemeId ? 'Update scheme' : 'Add scheme'}
          </button>
          {editingSchemeId ? (
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                setEditingSchemeId(null)
                setSchemeName('')
                setSchemeDetails('')
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
        <ul className="mt-3 space-y-2">
          {schemes.map((s) => {
            const row = stats?.schemes.find((x) => x.id === s.id)
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {s.name}
                    {!s.is_active ? (
                      <span className="ml-2 text-[10px] uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                        paused
                      </span>
                    ) : null}
                  </p>
                  {s.details ? (
                    <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">{s.details}</p>
                  ) : null}
                  {row ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-[var(--color-jewelry-black,#1a1814)]/55">
                      Explained {row.explained} · Interested {row.interested} · Joined {row.joined}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      setEditingSchemeId(s.id)
                      setSchemeName(s.name)
                      setSchemeDetails(s.details || '')
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[40px] items-center rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-700"
                    onClick={() => {
                      void appConfirm('Delete this scheme?').then((ok) => {
                        if (!ok) return
                        void deleteCrmScheme(s.id)
                          .then(() => load())
                          .then(() => appAlert('Scheme deleted.', 'success'))
                      })
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
