'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  X,
  Tag,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
} from 'lucide-react'

type PromoCode = {
  id: number
  code: string
  discount_type: string
  discount_value: number
  min_order_value: number | null
  max_uses: number | null
  current_uses: number
  expires_at: string | null
  is_active: boolean
  description: string | null
  created_at: string
}

const DISCOUNT_TYPES = [
  { value: 'fixed_amount', label: 'Fixed Amount (₹)', desc: 'Deduct a fixed rupee amount' },
  { value: 'percentage', label: 'Percentage (%)', desc: 'Deduct % of order value' },
  { value: 'free_shipping', label: 'Free Shipping', desc: 'Waive shipping (fixed ₹ value)' },
]

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [form, setForm] = useState({
    code: '',
    discount_type: 'fixed_amount' as string,
    discount_value: '',
    min_order_value: '',
    max_uses: '',
    expires_at: '',
    is_active: true,
    description: '',
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/promos')
      setPromos(Array.isArray(res.data) ? res.data : [])
    } catch {
      setPromos([])
      showToast('error', 'Failed to load promo codes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setForm({
      code: '',
      discount_type: 'fixed_amount',
      discount_value: '',
      min_order_value: '',
      max_uses: '',
      expires_at: '',
      is_active: true,
      description: '',
    })
    setEditingPromo(null)
  }

  const openCreateModal = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (promo: PromoCode) => {
    setEditingPromo(promo)
    setForm({
      code: promo.code,
      discount_type: promo.discount_type || 'fixed_amount',
      discount_value: promo.discount_value != null ? String(promo.discount_value) : '',
      min_order_value: promo.min_order_value != null ? String(promo.min_order_value) : '',
      max_uses: promo.max_uses != null ? String(promo.max_uses) : '',
      expires_at: promo.expires_at ? promo.expires_at.slice(0, 16) : '',
      is_active: promo.is_active ?? true,
      description: promo.description || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = form.code.trim().toUpperCase()
    if (!code) {
      showToast('error', 'Promo code is required')
      return
    }
    const discountValue = form.discount_value ? Number(form.discount_value) : 0
    if (discountValue < 0) {
      showToast('error', 'Discount value must be positive')
      return
    }
    setSaving(true)
    try {
      const payload = {
        code,
        discount_type: form.discount_type,
        discount_value: discountValue,
        min_order_value: form.min_order_value ? Number(form.min_order_value) : null,
        max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
        expires_at: form.expires_at || null,
        is_active: form.is_active,
        description: form.description.trim() || null,
      }
      if (editingPromo) {
        await axios.put(`/api/admin/promos/${editingPromo.id}`, payload)
        showToast('success', 'Promo code updated')
      } else {
        await axios.post('/api/admin/promos', payload)
        showToast('success', 'Promo code created')
      }
      setModalOpen(false)
      resetForm()
      load()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'Failed to save promo code'
      showToast('error', msg || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (promo: PromoCode) => {
    setTogglingId(promo.id)
    try {
      await axios.put(`/api/admin/promos/${promo.id}`, { is_active: !promo.is_active })
      showToast('success', promo.is_active ? 'Promo deactivated' : 'Promo activated')
      load()
    } catch {
      showToast('error', 'Failed to update status')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (promo: PromoCode) => {
    if (!confirm(`Delete promo "${promo.code}"? This cannot be undone.`)) return
    setDeletingId(promo.id)
    try {
      await axios.delete(`/api/admin/promos/${promo.id}`)
      showToast('success', 'Promo code deleted')
      load()
    } catch {
      showToast('error', 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const discountLabel = (p: PromoCode) => {
    if (p.discount_type === 'fixed_amount') return `₹${Number(p.discount_value).toLocaleString('en-IN')}`
    if (p.discount_type === 'percentage') return `${p.discount_value}%`
    return `₹${Number(p.discount_value).toLocaleString('en-IN')} off shipping`
  }

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all'
  const labelClass = 'block text-sm font-medium text-slate-400 mb-1.5'

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-slate-400">Loading...</div>
        </div>
      }
    >
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <Tag className="size-6 text-rose-500" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-100">Promo Codes & Offers</h1>
                    <p className="text-slate-500 text-sm">Create marketing campaigns. Fixed amount, percentage, or free shipping.</p>
                  </div>
                </div>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20"
                >
                  <Plus className="size-5" /> New Promo Code
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <Loader2 className="size-10 text-amber-500 animate-spin mx-auto" />
                  <p className="text-slate-500 mt-4">Loading promo codes…</p>
                </div>
              ) : promos.length === 0 ? (
                <div className="p-12 sm:p-16 text-center">
                  <Tag className="size-14 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">No promo codes yet</p>
                  <p className="text-slate-500 text-sm mt-1">Create your first promo to run marketing campaigns</p>
                  <button
                    onClick={openCreateModal}
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm"
                  >
                    <Plus className="size-5" /> Create Promo
                  </button>
                </div>
              ) : (
                <>
                  <div className="sm:hidden divide-y divide-white/5 p-4 space-y-4">
                    {promos.map((p) => (
                      <div key={p.id} className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-mono font-semibold text-amber-400">{p.code}</h3>
                            <span className="inline-flex mt-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-700 text-slate-300">
                              {discountLabel(p)}
                            </span>
                          </div>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${
                              p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600 text-slate-400'
                            }`}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {p.min_order_value != null && (
                          <p className="text-xs text-slate-500">Min order: ₹{Number(p.min_order_value).toLocaleString('en-IN')}</p>
                        )}
                        {p.max_uses != null && (
                          <p className="text-xs text-slate-500">
                            Uses: {p.current_uses}/{p.max_uses}
                          </p>
                        )}
                        {p.expires_at && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="size-3" /> Expires {new Date(p.expires_at).toLocaleDateString()}
                          </p>
                        )}
                        <div className="flex gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={() => openEditModal(p)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                          >
                            <Edit2 className="size-4" /> Edit
                          </button>
                          <button
                            onClick={() => toggleStatus(p)}
                            disabled={togglingId === p.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium border border-amber-500/40 disabled:opacity-50"
                          >
                            {togglingId === p.id ? <Loader2 className="size-4 animate-spin" /> : p.is_active ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                            {p.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={deletingId === p.id}
                            className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium border border-red-500/40 disabled:opacity-50"
                          >
                            {deletingId === p.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/40">
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Code</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Type</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Discount</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Min Order</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Uses</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Expires</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Status</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promos.map((p) => (
                          <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="py-4 px-5 font-mono font-semibold text-amber-400">{p.code}</td>
                            <td className="py-4 px-5">
                              <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium capitalize bg-slate-700/80 text-slate-300">
                                {p.discount_type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right font-medium text-slate-200 tabular-nums">
                              {discountLabel(p)}
                            </td>
                            <td className="py-4 px-5 text-right text-slate-400 tabular-nums">
                              {p.min_order_value != null ? `₹${Number(p.min_order_value).toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td className="py-4 px-5 text-right text-slate-400 tabular-nums">
                              {p.max_uses != null ? `${p.current_uses}/${p.max_uses}` : `${p.current_uses} used`}
                            </td>
                            <td className="py-4 px-5 text-slate-400 text-sm">
                              {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-4 px-5">
                              <span
                                className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                                  p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/80 text-slate-400'
                                }`}
                              >
                                {p.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditModal(p)}
                                  className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="size-4" />
                                </button>
                                <button
                                  onClick={() => toggleStatus(p)}
                                  disabled={togglingId === p.id}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                                    p.is_active
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {togglingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                  {p.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  onClick={() => handleDelete(p)}
                                  disabled={deletingId === p.id}
                                  className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Delete"
                                >
                                  {deletingId === p.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </main>

          {modalOpen && (
            <>
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => !saving && setModalOpen(false)} aria-hidden="true" />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
                <div
                  className="w-full max-w-md my-8 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/80">
                    <h2 className="text-lg font-semibold text-slate-100">
                      {editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}
                    </h2>
                    <button
                      onClick={() => !saving && setModalOpen(false)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <X className="size-5" />
                    </button>
                  </div>
                  <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
                    <div>
                      <label className={labelClass}>Promo Code</label>
                      <input
                        type="text"
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                        placeholder="e.g. WELCOME500"
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Discount Type</label>
                      <select
                        value={form.discount_type}
                        onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                        className={inputClass}
                      >
                        {DISCOUNT_TYPES.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} — {opt.desc}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        {form.discount_type === 'percentage' ? 'Percentage (%)' : 'Discount Value (₹)'}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={form.discount_type === 'percentage' ? '1' : '0.01'}
                        value={form.discount_value}
                        onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                        placeholder={form.discount_type === 'percentage' ? 'e.g. 10' : 'e.g. 500'}
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Min Order Value (₹) — optional</label>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        value={form.min_order_value}
                        onChange={(e) => setForm({ ...form, min_order_value: e.target.value })}
                        placeholder="e.g. 5000"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Max Uses — optional</label>
                      <input
                        type="number"
                        min={0}
                        value={form.max_uses}
                        onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                        placeholder="Unlimited"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Expires At — optional</label>
                      <input
                        type="datetime-local"
                        value={form.expires_at}
                        onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Description — optional (shown to customer)</label>
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="e.g. Welcome Discount"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                      />
                      <label htmlFor="is_active" className="text-sm text-slate-300">Active (redeemable by customers)</label>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => !saving && setModalOpen(false)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {saving ? <Loader2 className="size-5 animate-spin" /> : null}
                        {editingPromo ? 'Update' : 'Create'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </>
          )}

          {toast && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300">
              <div
                className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[280px] max-w-[90vw] ${
                  toast.type === 'success' ? 'bg-emerald-500/95 text-white border-emerald-400' : 'bg-red-500/95 text-white border-red-400'
                }`}
              >
                {toast.type === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
                <span>{toast.message}</span>
              </div>
            </div>
          )}
        </div>
      </AdminGuard>
    </Suspense>
  )
}
