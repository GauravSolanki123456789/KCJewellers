'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import { Loader2, ArrowLeft, Save } from 'lucide-react'

type AdminUser = {
  id: number
  email: string | null
  name: string | null
  mobile_number?: string | null
  customer_tier?: string | null
  wholesale_making_charge_discount_percent?: number | string | null
  wholesale_markup_percent?: number | string | null
  account_status?: string | null
}

const TIERS = ['B2C_CUSTOMER', 'B2B_WHOLESALE', 'ADMIN'] as const

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) => {
      const em = (u.email || '').toLowerCase()
      const mob = (u.mobile_number || '').replace(/\D/g, '')
      return em.includes(s) || mob.includes(s.replace(/\D/g, '')) || String(u.id) === s
    })
  }, [users, q])

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
            <p className="text-slate-500 text-sm mt-1">
              Set <code className="text-slate-400">customer_tier</code> to B2B_WHOLESALE (or ADMIN), adjust making-charge
              discount % and markup %, and optionally add ledger lines.
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
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-[11px] uppercase text-slate-500">
                  <th className="p-2">ID</th>
                  <th className="p-2">Email / Mobile</th>
                  <th className="p-2">Tier</th>
                  <th className="p-2">MC disc %</th>
                  <th className="p-2">Markup %</th>
                  <th className="p-2">Mobile</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-slate-800/80 align-top">
                    <td className="p-2 font-mono text-xs text-slate-500">{u.id}</td>
                    <td className="p-2">
                      <div className="text-slate-200">{u.email || '—'}</div>
                      <div className="text-xs text-slate-500">{u.mobile_number ? `+91 ${u.mobile_number}` : ''}</div>
                    </td>
                    <td className="p-2">
                      <select
                        className="w-full min-w-[140px] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
                        value={(u.customer_tier || 'B2C_CUSTOMER').toUpperCase()}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
