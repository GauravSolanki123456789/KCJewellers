'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import axios from '@/lib/axios'
import { CUSTOMER_TIER } from '@/lib/customer-tier'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Loader2, ArrowLeft, Save, Store, Upload } from 'lucide-react'

type AdminUser = {
  id: number
  email: string | null
  name: string | null
  mobile_number?: string | null
  customer_tier?: string | null
  wholesale_making_charge_discount_percent?: number | string | null
  wholesale_markup_percent?: number | string | null
  account_status?: string | null
  business_name?: string | null
  custom_domain?: string | null
  logo_url?: string | null
  allowed_category_ids?: number[] | null
}

type CatalogCategoryRow = {
  id: number
  name: string
  slug?: string
  is_published?: boolean
}

const TIERS = ['B2C_CUSTOMER', 'B2B_WHOLESALE', 'RESELLER', 'ADMIN'] as const

/** Must match `uploadResellerLogo` limits in server.js */
const RESELLER_LOGO_MAX_BYTES = 5 * 1024 * 1024
const RESELLER_LOGO_MAX_LABEL = '5 MB'
const RESELLER_LOGO_ACCEPT_ATTR =
  'image/png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

export default function AdminB2BClientsPage() {
  return (
    <AdminGuard>
      <B2BAdminContent />
    </AdminGuard>
  )
}

function B2BAdminContent() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [ledgerUserId, setLedgerUserId] = useState<number | null>(null)
  const [ledgerForm, setLedgerForm] = useState({
    txn_category: 'PURCHASE' as 'PURCHASE' | 'CASH_PAYMENT' | 'METAL_DEPOSIT',
    amount_rupees: '',
    fine_metal_grams: '',
    metal_type: 'gold',
    description: '',
  })

  const [resellerModalUser, setResellerModalUser] = useState<AdminUser | null>(null)
  const [resellerForm, setResellerForm] = useState({
    business_name: '',
    custom_domain: '',
    logo_url: '',
    allowed_category_ids: [] as number[],
    contact_mobile: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoFileError, setLogoFileError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategoryRow[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [resellerSaving, setResellerSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<AdminUser[]>('/api/admin/users')
      setUsers(Array.isArray(res.data) ? res.data : [])
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true)
    try {
      const res = await axios.get<{ categories?: CatalogCategoryRow[] }>('/api/admin/catalog')
      const cats = res.data?.categories ?? []
      setCatalogCategories(cats.filter((c) => c.is_published !== false))
    } catch {
      setCatalogCategories([])
    } finally {
      setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (resellerModalUser) {
      loadCategories()
      const ids = resellerModalUser.allowed_category_ids
      setResellerForm({
        business_name: resellerModalUser.business_name ?? '',
        custom_domain: resellerModalUser.custom_domain ?? '',
        logo_url: resellerModalUser.logo_url ?? '',
        allowed_category_ids: Array.isArray(ids) ? [...ids] : [],
        contact_mobile: resellerModalUser.mobile_number ?? '',
      })
      setLogoFile(null)
      setLogoFileError(null)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }, [resellerModalUser, loadCategories])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) => {
      const em = (u.email || '').toLowerCase()
      const mob = (u.mobile_number || '').replace(/\D/g, '')
      return em.includes(s) || mob.includes(s.replace(/\D/g, '')) || String(u.id) === s
    })
  }, [users, q])

  useEffect(() => {
    if (ledgerUserId == null) return
    const row = users.find((x) => x.id === ledgerUserId)
    const tier = String(row?.customer_tier || '').toUpperCase()
    if (tier === CUSTOMER_TIER.RESELLER) setLedgerUserId(null)
  }, [users, ledgerUserId])

  const saveUser = async (u: AdminUser) => {
    setSavingId(u.id)
    try {
      await axios.put(`/api/admin/users/${u.id}`, {
        customer_tier: u.customer_tier,
        wholesale_making_charge_discount_percent: Number(u.wholesale_making_charge_discount_percent ?? 0),
        wholesale_markup_percent: Number(u.wholesale_markup_percent ?? 0),
        mobile_number: u.mobile_number || undefined,
      })
      await load()
    } catch (e) {
      console.error(e)
      alert('Save failed — check console')
    } finally {
      setSavingId(null)
    }
  }

  const saveResellerProfile = async () => {
    if (!resellerModalUser) return
    setResellerSaving(true)
    try {
      let logoUrl = resellerForm.logo_url.trim() || null
      if (logoFile) {
        if (logoFile.size > RESELLER_LOGO_MAX_BYTES) {
          setLogoFileError(`Image is too large. Maximum file size is ${RESELLER_LOGO_MAX_LABEL}.`)
          setResellerSaving(false)
          return
        }
        const fd = new FormData()
        fd.append('logo', logoFile)
        const up = await axios.post<{ logo_url?: string }>(
          `/api/admin/users/${resellerModalUser.id}/reseller-logo`,
          fd,
        )
        if (up.data?.logo_url) logoUrl = up.data.logo_url
      }
      const rawMob = resellerForm.contact_mobile.trim()
      const mobDigits = rawMob.replace(/\D/g, '').slice(-10)
      if (rawMob && mobDigits.length !== 10) {
        alert('WhatsApp / orders: enter exactly 10 digits, or leave blank.')
        setResellerSaving(false)
        return
      }
      await axios.put(`/api/admin/users/${resellerModalUser.id}`, {
        business_name: resellerForm.business_name.trim() || null,
        custom_domain: resellerForm.custom_domain.trim() || null,
        logo_url: logoUrl,
        allowed_category_ids: resellerForm.allowed_category_ids,
        mobile_number: rawMob ? mobDigits : null,
      })
      await load()
      setResellerModalUser(null)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Could not save reseller settings')
    } finally {
      setResellerSaving(false)
    }
  }

  const postLedger = async () => {
    if (!ledgerUserId) return
    try {
      await axios.post('/api/admin/b2b/ledger-entries', {
        user_id: ledgerUserId,
        txn_category: ledgerForm.txn_category,
        amount_rupees: Number(ledgerForm.amount_rupees || 0),
        fine_metal_grams: Number(ledgerForm.fine_metal_grams || 0),
        metal_type: ledgerForm.metal_type,
        description: ledgerForm.description,
      })
      setLedgerForm((f) => ({ ...f, amount_rupees: '', fine_metal_grams: '', description: '' }))
      alert('Ledger entry posted')
    } catch (e) {
      console.error(e)
      alert('Ledger post failed')
    }
  }

  const toggleCategoryId = (id: number) => {
    setResellerForm((f) => {
      const set = new Set(f.allowed_category_ids)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, allowed_category_ids: [...set].sort((a, b) => a - b) }
    })
  }

  const onLogoSelected = (e: ChangeEvent<HTMLInputElement>) => {
    setLogoFileError(null)
    const f = e.target.files?.[0] ?? null
    if (!f) {
      setLogoFile(null)
      return
    }
    if (f.size > RESELLER_LOGO_MAX_BYTES) {
      setLogoFileError(`Image is too large. Maximum file size is ${RESELLER_LOGO_MAX_LABEL}.`)
      setLogoFile(null)
      e.target.value = ''
      return
    }
    const mimeOk = /^image\/(png|jpe?g|gif|webp)$/i.test(f.type)
    const extOk = /\.(png|jpe?g|gif|webp)$/i.test(f.name)
    if (!mimeOk && !extOk) {
      setLogoFileError('Use PNG, JPEG, JPG, GIF, or WebP only.')
      setLogoFile(null)
      e.target.value = ''
      return
    }
    setLogoFile(f)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 p-4 md:p-8 pb-28 md:pb-16 safe-area-pb">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-amber-500 mb-2">
              <ArrowLeft className="size-4" />
              Admin
            </Link>
            <h1 className="text-2xl font-bold text-amber-400">B2B wholesale clients</h1>
            <p className="text-slate-500 text-sm mt-1 max-w-xl leading-relaxed">
              Set <code className="text-slate-400">customer_tier</code> for access: B2B wholesale,{' '}
              <strong className="text-slate-300 font-medium">RESELLER</strong> (white-label catalogue sharing), or ADMIN.
              Resellers can use Catalogue Builder and optional custom domains. They do not get Wholesale quick order or
              client Khata (ledger); use <strong className="text-slate-300 font-medium">B2B_WHOLESALE</strong> for that.
            </p>
          </div>
        </div>

        <input
          type="search"
          placeholder="Search by email, mobile, or user id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-6 w-full max-w-md min-h-[48px] rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm shadow-inner shadow-black/20 focus:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />

        <div className="rounded-2xl border border-slate-800/90 bg-slate-900/30 shadow-xl shadow-black/25 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-[11px] uppercase text-slate-500">
                  <th className="p-2">ID</th>
                  <th className="p-2">Client</th>
                  <th className="p-2">Tier</th>
                  <th className="p-2">MC disc %</th>
                  <th className="p-2">Markup %</th>
                  <th className="p-2">Mobile</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const tierUp = (u.customer_tier || 'B2C_CUSTOMER').toUpperCase()
                  const isReseller = tierUp === CUSTOMER_TIER.RESELLER
                  return (
                    <tr key={u.id} className="border-b border-slate-800/80 align-top">
                      <td className="p-2 font-mono text-xs text-slate-500">{u.id}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0">
                            <div className="text-slate-200">{u.email || '—'}</div>
                            <div className="text-xs text-slate-500">
                              {u.mobile_number ? `+91 ${u.mobile_number}` : ''}
                            </div>
                          </div>
                          {isReseller && (
                            <button
                              type="button"
                              onClick={() => setResellerModalUser(u)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-500/35 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 md:text-xs"
                            >
                              <Store className="size-3.5 opacity-90" aria-hidden />
                              Edit reseller
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <select
                          className="w-full min-w-[140px] max-w-[180px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                          value={tierUp}
                          onChange={(e) => {
                            const v = e.target.value
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, customer_tier: v } : x)))
                          }}
                        >
                          {TIERS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                          value={u.wholesale_making_charge_discount_percent ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setUsers((prev) =>
                              prev.map((x) =>
                                x.id === u.id ? { ...x, wholesale_making_charge_discount_percent: v as unknown as number } : x,
                              ),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                          value={u.wholesale_markup_percent ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setUsers((prev) =>
                              prev.map((x) =>
                                x.id === u.id ? { ...x, wholesale_markup_percent: v as unknown as number } : x,
                              ),
                            )
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="tel"
                          placeholder="10-digit"
                          className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
                          value={u.mobile_number ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '').slice(-10)
                            setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, mobile_number: v } : x)))
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          disabled={savingId === u.id}
                          onClick={() => saveUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/30"
                        >
                          {savingId === u.id ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                          Save
                        </button>
                        {tierUp !== CUSTOMER_TIER.RESELLER ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLedgerUserId(u.id)
                              setLedgerForm((f) => ({ ...f }))
                            }}
                            className="ml-2 text-xs text-emerald-400 hover:underline"
                          >
                            Ledger
                          </button>
                        ) : (
                          <span
                            className="ml-2 inline-block text-xs text-slate-600"
                            title="Khata is for B2B wholesale accounts only, not resellers."
                          >
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {resellerModalUser && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-0 backdrop-blur-md sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reseller-modal-title"
          >
            <div className="max-h-[92vh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-700 border-b-0 bg-slate-900 shadow-2xl sm:rounded-2xl sm:border-b flex flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
                <div>
                  <h2 id="reseller-modal-title" className="text-lg font-semibold text-slate-50">
                    Reseller profile
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{resellerModalUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResellerModalUser(null)}
                  className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/10 hover:text-slate-200"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 space-y-4 safe-area-pb">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Business name</label>
                  <input
                    className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={resellerForm.business_name}
                    onChange={(e) => setResellerForm((f) => ({ ...f, business_name: e.target.value }))}
                    placeholder="Shown on navbar & shared links"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    WhatsApp / orders (10-digit)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={14}
                    className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={resellerForm.contact_mobile}
                    onChange={(e) =>
                      setResellerForm((f) => ({ ...f, contact_mobile: e.target.value }))
                    }
                    placeholder="Customer orders via WhatsApp checkout"
                  />
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    Saved as your account mobile — used for &quot;Send Order via WhatsApp&quot; on your custom domain storefront.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Logo</label>
                  <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                    Accepted formats: <span className="text-slate-400">PNG, JPEG, JPG, GIF, WebP</span>
                    <span className="mx-1.5 text-slate-600">·</span>
                    Max size: <span className="text-slate-400">{RESELLER_LOGO_MAX_LABEL}</span>
                  </p>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/50 px-4 py-6 text-center text-xs text-slate-400 hover:border-amber-500/40 hover:bg-slate-900/80">
                    <Upload className="size-5 text-amber-500/80" aria-hidden />
                    <span className="max-w-full break-all px-1">
                      {logoFile ? logoFile.name : 'Tap to choose an image'}
                    </span>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept={RESELLER_LOGO_ACCEPT_ATTR}
                      className="sr-only"
                      onChange={onLogoSelected}
                    />
                  </label>
                  {logoFileError ? (
                    <p className="mt-2 text-xs font-medium text-rose-400" role="alert">
                      {logoFileError}
                    </p>
                  ) : null}
                  {resellerForm.logo_url && !logoFile && (
                    <p className="mt-2 text-[11px] text-slate-500 truncate">Current: {resellerForm.logo_url}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Custom domain</label>
                  <input
                    className="w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={resellerForm.custom_domain}
                    onChange={(e) => setResellerForm((f) => ({ ...f, custom_domain: e.target.value }))}
                    placeholder="e.g. boutique.example.com"
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Point your domain&apos;s <strong className="text-slate-400">A record</strong> to your Next.js server IP
                    (same host as KC Jewellers web). Share links will use https://your-domain when set.
                  </p>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-400">Allowed catalogue categories</label>
                    {categoriesLoading && <Loader2 className="size-4 animate-spin text-slate-500" />}
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                    {catalogCategories.length === 0 && !categoriesLoading ? (
                      <p className="text-xs text-slate-500">No published categories found.</p>
                    ) : (
                      catalogCategories.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]"
                        >
                          <input
                            type="checkbox"
                            checked={resellerForm.allowed_category_ids.includes(c.id)}
                            onChange={() => toggleCategoryId(c.id)}
                            className="mt-0.5 size-4 rounded border-slate-600"
                          />
                          <span className="text-sm text-slate-200">
                            {c.name}{' '}
                            <span className="font-mono text-[11px] text-slate-500">#{c.id}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Leave none checked to allow all categories. Select specific styles to restrict the reseller catalogue.
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-800 p-4 sm:px-5 flex gap-3 safe-area-pb">
                <button
                  type="button"
                  onClick={() => setResellerModalUser(null)}
                  className="flex-1 min-h-[48px] rounded-xl border border-slate-600 py-3 text-sm font-medium touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resellerSaving}
                  onClick={() => void saveResellerProfile()}
                  className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-r from-violet-600 to-amber-600 py-3 text-sm font-semibold text-white shadow-lg touch-manipulation disabled:opacity-60"
                >
                  {resellerSaving ? <Loader2 className="mx-auto size-5 animate-spin" /> : 'Save reseller settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {ledgerUserId != null && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-700 border-b-0 bg-slate-900 p-6 shadow-2xl sm:rounded-2xl sm:border-b">
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Post ledger entry — user #{ledgerUserId}</h2>
              <div className="space-y-3">
                <label className="block text-xs text-slate-500">Type</label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  value={ledgerForm.txn_category}
                  onChange={(e) =>
                    setLedgerForm((f) => ({ ...f, txn_category: e.target.value as typeof f.txn_category }))
                  }
                >
                  <option value="PURCHASE">Purchase</option>
                  <option value="CASH_PAYMENT">Cash Payment</option>
                  <option value="METAL_DEPOSIT">Metal Deposit</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Amount ₹</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={ledgerForm.amount_rupees}
                      onChange={(e) => setLedgerForm((f) => ({ ...f, amount_rupees: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Fine metal (g)</label>
                    <input
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      value={ledgerForm.fine_metal_grams}
                      onChange={(e) => setLedgerForm((f) => ({ ...f, fine_metal_grams: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Metal type</label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={ledgerForm.metal_type}
                    onChange={(e) => setLedgerForm((f) => ({ ...f, metal_type: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Description</label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    value={ledgerForm.description}
                    onChange={(e) => setLedgerForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="safe-area-pb mt-6 flex gap-3 pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setLedgerUserId(null)}
                  className="flex-1 min-h-[48px] rounded-xl border border-slate-600 py-3 text-sm font-medium touch-manipulation active:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={postLedger}
                  className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 touch-manipulation hover:bg-emerald-500"
                >
                  Post entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
