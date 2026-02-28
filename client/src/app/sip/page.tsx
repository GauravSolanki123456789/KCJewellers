'use client'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'

declare global { interface Window { Razorpay: any } }

export default function GoldSavingsPage() {
  const [balance, setBalance] = useState<number>(0)
  const [txs, setTxs] = useState<any[]>([])
  const [amount, setAmount] = useState<number>(1000)
  const [frequency, setFrequency] = useState<'DAILY' | 'MONTHLY'>('MONTHLY')
  const [withdrawGrams, setWithdrawGrams] = useState<number>(0)
  const [userId, setUserId] = useState<number | null>(null)
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    axios.get(`${url}/api/auth/current_user`, { withCredentials: true }).then(r => {
      const u = r.data
      setUserId(u?.user?.id || u?.id || null)
      if (u?.id) {
        axios.get(`${url}/api/sip/wallet`, { params: { user_id: u.id }, withCredentials: true }).then(w => {
          setBalance(Number(w.data?.wallet_gold_balance || 0))
          setTxs(w.data?.transactions || [])
        })
      }
    }).catch(() => {})
    return () => { document.body.removeChild(script) }
  }, [])
  const points = useMemo(() => {
    const arr = (txs || []).slice().reverse()
    if (arr.length === 0) return ''
    const max = Math.max(...arr.map((t: any) => Number(t.amount || 0)))
    return arr.map((t: any, i: number) => {
      const x = (i / (arr.length - 1)) * 300
      const y = 100 - ((Number(t.amount || 0) / (max || 1)) * 100)
      return `${x},${y}`
    }).join(' ')
  }, [txs])
  const setupAutopay = async () => {
    if (!userId) return alert('Login required')
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const sub = await axios.post(`${url}/api/sip/subscribe`, { user_id: userId, amount, frequency }, { withCredentials: true })
    const subscriptionId = sub.data?.razorpay_subscription_id
    const options: any = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      name: 'KC Jewellers',
      description: `Gold Savings ${frequency}`,
      subscription_id: subscriptionId,
      handler: function () { alert('Subscription initiated. Autopay charges will credit Gold automatically.') }
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
  }
  const withdraw = async () => {
    if (!userId) return alert('Login required')
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const payload: any = { user_id: userId }
    if (withdrawGrams > 0) payload.grams = withdrawGrams
    const resp = await axios.post(`${url}/api/sip/withdraw`, payload, { withCredentials: true })
    if (resp.data?.status === 'PENDING_ADMIN_APPROVAL') alert('Withdrawal requested. Pending admin approval.')
  }
  return (
    <div className="p-4 space-y-4">
      <div className="glass-card p-4">
        <div className="text-xl font-semibold">Gold Savings</div>
        <div className="mt-2">Digital Gold Balance: {balance.toFixed(6)} g</div>
        <div className="mt-3">
          <svg width="300" height="100" className="glass-card">
            <polyline fill="none" stroke="gold" strokeWidth="2" points={points} />
          </svg>
        </div>
        <div className="mt-4 flex gap-3 items-end">
          <div>
            <div className="text-sm opacity-80">Amount (₹)</div>
            <input value={amount} onChange={(e) => setAmount(parseFloat(e.target.value || '1000'))} className="glass-card py-2 px-3 w-28" />
          </div>
          <div>
            <div className="text-sm opacity-80">Frequency</div>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="glass-card py-2 px-3">
              <option value="DAILY">Daily</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <button className="px-4 py-2 gold-bg text-black rounded" onClick={setupAutopay}>Setup Autopay</button>
          <div>
            <div className="text-sm opacity-80">Withdraw (g)</div>
            <input value={withdrawGrams} onChange={(e) => setWithdrawGrams(parseFloat(e.target.value || '0'))} className="glass-card py-2 px-3 w-28" />
          </div>
          <button className="px-4 py-2 glass-card" onClick={withdraw}>Sell / Withdraw</button>
        </div>
      </div>
    </div>
  )
}
