'use client'
import axios from 'axios'
import { useEffect, useState } from 'react'

declare global {
  interface Window { Razorpay: any }
}

export default function BuyGoldPage() {
  const [rate, setRate] = useState<number>(0)
  const [grams, setGrams] = useState<number>(10)
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    axios.get(`${url}/api/rates/display`).then(res => {
      const gold = (res.data?.rates || []).find((r: any) => (r.metal_type || '').toLowerCase() === 'gold')
      setRate(Number(gold?.display_rate || gold?.sell_rate || 0))
    }).catch(() => {})
    return () => { document.body.removeChild(script) }
  }, [])
  const lockAndPay = async () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const qtyKg = grams / 1000
    const res = await axios.post(`${url}/api/booking/lock`, { metal_type: 'gold', quantity_kg: qtyKg })
    const { razorpay_order_id, amount } = res.data
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      amount: Math.round(amount * 100),
      currency: 'INR',
      name: 'KC Jewellers',
      description: 'Bullion Purchase - Gold',
      order_id: razorpay_order_id,
      handler: function () { alert('Payment initiated. Confirmation will reflect once webhook processes.') }
    }
    const rzp = new window.Razorpay(options)
    rzp.open()
  }
  return (
    <div className="p-4 space-y-4">
      <div className="glass-card p-4">
        <div className="text-xl font-semibold">Buy Bullion: Gold</div>
        <div className="mt-2">Current Rate: ₹{Math.round(rate)} per gram</div>
        <div className="mt-3 flex items-center gap-2">
          <span>Qty (grams)</span>
          <input value={grams} onChange={(e) => setGrams(parseFloat(e.target.value || '1'))} className="w-24 text-center glass-card py-1" />
        </div>
        <div className="mt-2">Est. Amount: ₹{Math.round(rate * grams)}</div>
        <div className="mt-4">
          <button className="px-4 py-2 gold-bg text-black rounded" onClick={lockAndPay}>Lock & Pay</button>
        </div>
      </div>
    </div>
  )
}
