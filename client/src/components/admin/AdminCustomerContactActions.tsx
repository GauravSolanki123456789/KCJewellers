'use client'

import { Phone, MessageCircle } from 'lucide-react'
import {
  normalizeIndianMobileDigits,
  toWhatsAppWaMeFromMobile,
} from '@/lib/customer-contact'

type ContactOrder = {
  id?: number
  customer_name?: string
  customer_mobile?: string
}

type Props = {
  order: ContactOrder
  /** Prefilled WhatsApp message; when omitted, a simple greeting is used */
  whatsAppMessage?: string
  compact?: boolean
  className?: string
}

function buildDefaultWhatsAppMessage(order: ContactOrder): string {
  const name = order.customer_name?.trim() || 'Customer'
  const id = order.id != null ? `#${order.id}` : 'your order'
  return `Hello ${name}, this is KC Jewellers regarding ${id}. How can we help you today?`
}

export default function AdminCustomerContactActions({
  order,
  whatsAppMessage,
  compact = false,
  className = '',
}: Props) {
  const mobile = normalizeIndianMobileDigits(order.customer_mobile)
  if (mobile.length !== 10) {
    return (
      <span
        className={`text-xs text-slate-500 italic ${className}`}
        title="No mobile number on this order"
      >
        No mobile
      </span>
    )
  }

  const waDigits = toWhatsAppWaMeFromMobile(mobile)
  const text = encodeURIComponent(whatsAppMessage || buildDefaultWhatsAppMessage(order))
  const waHref = `https://wa.me/${waDigits}?text=${text}`
  const telHref = `tel:+91${mobile}`

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <a
          href={telHref}
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label={`Call ${order.customer_name || 'customer'}`}
          title="Call customer"
        >
          <Phone className="size-4" />
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg kc-admin-wa-btn transition-colors"
          aria-label={`WhatsApp ${order.customer_name || 'customer'}`}
          title="WhatsApp customer"
        >
          <MessageCircle className="size-4" />
        </a>
      </div>
    )
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a
        href={telHref}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 bg-slate-800/50 text-slate-200 hover:bg-slate-700/50 text-xs font-medium transition-colors min-h-[36px]"
      >
        <Phone className="size-3.5 shrink-0" aria-hidden />
        Call
      </a>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg kc-admin-wa-btn text-xs font-semibold min-h-[36px]"
      >
        <MessageCircle className="size-3.5 shrink-0" aria-hidden />
        WhatsApp
      </a>
    </div>
  )
}

/** Build confirmation WhatsApp link for admin → customer after order placed */
export function adminOrderWhatsAppMessage(
  order: { id?: number; customer_name?: string; total_amount?: number },
  invoiceUrl: string,
): string {
  const name = order.customer_name?.trim() || 'Customer'
  const amount = Number(order.total_amount || 0).toLocaleString('en-IN')
  const id = order.id ?? '—'
  return `Hello ${name}, your order #${id} for ₹${amount} has been confirmed! View your invoice here: ${invoiceUrl}`
}
