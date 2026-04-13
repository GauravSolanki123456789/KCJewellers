'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, MessageCircle, Package } from 'lucide-react'
import { CATALOG_PATH } from '@/lib/routes'
import { buildWhatsAppBusinessChatLink, orderConfirmationWhatsAppMessage } from '@/lib/whatsapp'

function CheckoutSuccessInner() {
  const searchParams = useSearchParams()
  const orderIdParam = searchParams.get('orderId')
  const orderId = orderIdParam ? parseInt(orderIdParam, 10) : NaN
  const hasOrder = !Number.isNaN(orderId)

  const wa = hasOrder
    ? buildWhatsAppBusinessChatLink(
        orderConfirmationWhatsAppMessage({ orderId, kind: 'retail' }),
      )
    : buildWhatsAppBusinessChatLink(
        'Hi KC Jewellers — I just completed checkout on your website. Please confirm my order. Thank you!',
      )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 pb-28">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="size-10 text-green-500" />
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Order placed successfully</h1>
        <p className="text-slate-400 mb-6 text-sm leading-relaxed">
          {hasOrder ? (
            <>
              Order <span className="font-mono text-amber-400/95">#{orderId}</span> is recorded. We will confirm soon.
            </>
          ) : (
            <>Thank you — you will receive a confirmation once payment is verified.</>
          )}
        </p>

        {hasOrder && (
          <Link
            href={`/orders/${orderId}`}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-slate-100 hover:bg-white/10 transition-colors"
          >
            <Package className="size-4 shrink-0 text-amber-400" aria-hidden />
            View what you ordered
          </Link>
        )}

        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition-colors"
          >
            <MessageCircle className="size-5 shrink-0" aria-hidden />
            Message KC on WhatsApp
          </a>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={CATALOG_PATH}
            className="px-6 py-3 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition-colors"
          >
            Continue shopping
          </Link>
          <Link
            href="/profile"
            className="px-6 py-3 rounded-lg border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
          >
            Profile & orders
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <CheckoutSuccessInner />
    </Suspense>
  )
}
