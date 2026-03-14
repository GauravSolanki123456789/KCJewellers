'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/hooks/useAuth'
import axios from '@/lib/axios'

declare global {
  interface Window {
    Razorpay: any
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''

function CheckoutContent() {
  const router = useRouter()
  const { items, remove, setQty } = useCart()
  const auth = useAuth()
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  useEffect(() => {
    if (!auth.isAuthenticated) {
      window.location.href = `${API_URL}/auth/google`
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.body.appendChild(script)
    return () => {
      if (script.parentNode) document.body.removeChild(script)
    }
  }, [auth.isAuthenticated])

  const grandTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  const handlePay = async () => {
    if (items.length === 0) return
    if (!scriptLoaded || !RAZORPAY_KEY) {
      alert('Payment is loading. Please try again in a moment.')
      return
    }
    setLoading(true)
    try {
      const payload = items.map((ci) => ({
        id: ci.id,
        item: ci.item,
        qty: ci.qty,
        price: ci.price,
        breakdown: ci.breakdown,
      }))
      const res = await axios.post('/api/checkout/create-order', { items: payload })
      const { razorpay_order_id, amount, key_id } = res.data
      const options = {
        key: key_id || RAZORPAY_KEY,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: 'KC Jewellers',
        description: 'Jewellery Order',
        order_id: razorpay_order_id,
        handler: () => {
          items.forEach((ci) => remove(ci.id))
          router.push('/checkout/success')
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Redirecting to login…</div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 p-4">
        <Link href="/catalog" className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6">
          <ChevronLeft className="size-4" />
          Back to Catalog
        </Link>
        <div className="max-w-md mx-auto text-center py-16">
          <p className="text-slate-300 text-lg">Your cart is empty</p>
          <Link href="/catalog" className="mt-4 inline-block px-6 py-3 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400">
            Browse Catalog
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-lg mx-auto px-4 py-6 pb-28">
        <Link href="/catalog" className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6">
          <ChevronLeft className="size-4" />
          Back to Catalog
        </Link>

        <h1 className="text-xl font-semibold text-slate-200 mb-6">Checkout</h1>

        <div className="space-y-3 mb-8">
          {items.map((ci) => {
            const lineTotal = ci.price * ci.qty
            const name = ci.item.item_name || ci.item.short_name || 'Item'
            return (
              <div key={ci.id} className="flex gap-3 p-4 rounded-lg border border-white/10 bg-slate-800/30">
                {ci.item.image_url ? (
                  <img src={ci.item.image_url} alt={name} className="w-16 h-16 rounded-lg object-contain bg-slate-800" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center">
                    <span className="text-xl font-bold text-slate-500">{name.charAt(0)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{name}</div>
                  <div className="text-sm text-amber-400">₹{Math.round(lineTotal).toLocaleString('en-IN')} × {ci.qty}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-800 pt-4 mb-6">
          <div className="flex justify-between text-lg font-semibold">
            <span>Grand Total</span>
            <span className="text-amber-400">₹{Math.round(grandTotal).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={loading}
          className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60 transition-opacity"
        >
          {loading ? 'Processing…' : 'Pay with Razorpay'}
        </button>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading…</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
