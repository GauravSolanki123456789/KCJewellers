'use client'
import axios from '@/lib/axios'
import { useEffect, useState } from 'react'
import AdminGuard from '@/components/AdminGuard'

export default function AdminPayoutsPage() {
  const [items, setItems] = useState<any[]>([])
  const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  const load = async () => {
    try {
      const res = await axios.get(`${url}/api/admin/sip/payout_requests`, { withCredentials: true })
      setItems(res.data || [])
    } catch {}
  }
  useEffect(() => { load() }, [])
  const approve = async (id: number) => {
    try {
      await axios.post(`${url}/api/admin/sip/withdraw/approve`, { request_id: id }, { withCredentials: true })
      await load()
    } catch {}
  }
  return (
    <AdminGuard>
      <div className="p-4 space-y-4">
        <div className="glass-card p-4">
          <div className="text-xl font-semibold">SIP Payout Requests</div>
          <div className="mt-3 space-y-2">
            {items.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between glass-card p-2">
                <div>
                  <div className="text-sm">User #{r.user_id}</div>
                  <div className="text-sm">Grams: {Number(r.grams).toFixed(6)} • Amount: ₹{Math.round(r.amount)}</div>
                  <div className="text-xs opacity-70">{r.status}</div>
                </div>
                {r.status === 'PENDING_ADMIN_APPROVAL' && (
                  <button className="px-3 py-1 gold-bg text-black rounded" onClick={() => approve(r.id)}>Approve</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminGuard>
  )
}
