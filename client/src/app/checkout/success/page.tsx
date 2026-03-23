'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { CATALOG_PATH } from '@/lib/routes'

export default function CheckoutSuccessPage() {

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="size-10 text-green-500" />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Order Placed Successfully</h1>
        <p className="text-slate-400 mb-8">
          Thank you for your order. You will receive a confirmation once the payment is verified.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={CATALOG_PATH}
            className="px-6 py-3 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
          >
            Continue Shopping
          </Link>
          <Link
            href="/profile"
            className="px-6 py-3 rounded-lg border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
          >
            View Profile
          </Link>
        </div>
      </div>
    </div>
  )
}
