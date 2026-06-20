'use client'

import { User, Phone } from 'lucide-react'
import {
  type CheckoutContact,
  formatIndianMobileDisplay,
  validateCheckoutContact,
} from '@/lib/customer-contact'

type Props = {
  value: CheckoutContact
  onChange: (next: CheckoutContact) => void
  /** Shown after user tries to pay / send WhatsApp with invalid fields */
  showErrors?: boolean
  disabled?: boolean
}

export default function CheckoutContactForm({ value, onChange, showErrors = false, disabled }: Props) {
  const error = validateCheckoutContact(value)
  const nameErr = showErrors && value.name.trim().length < 2
  const mobileDigits = value.mobile.replace(/\D/g, '').slice(-10)
  const mobileErr = showErrors && mobileDigits.length !== 10

  return (
    <section
      className="mb-6 rounded-xl border border-white/10 bg-slate-900/50 p-4 sm:p-5"
      aria-labelledby="checkout-contact-heading"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
          <User className="size-5 text-amber-500" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 id="checkout-contact-heading" className="font-semibold text-slate-200 text-base">
            Your contact details
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Required so we can confirm your order and reach you on WhatsApp or phone.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="checkout-contact-name" className="block text-xs font-medium text-slate-400 mb-1.5">
            Full name
          </label>
          <input
            id="checkout-contact-name"
            type="text"
            autoComplete="name"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="e.g. Rajesh Shenoy"
            disabled={disabled}
            className={`w-full px-4 py-3 rounded-xl bg-slate-800 border text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-sm sm:text-base disabled:opacity-60 ${
              nameErr ? 'border-red-500/60' : 'border-slate-600'
            }`}
          />
          {nameErr && (
            <p className="mt-1.5 text-xs text-red-400">Enter your full name</p>
          )}
        </div>

        <div>
          <label htmlFor="checkout-contact-mobile" className="block text-xs font-medium text-slate-400 mb-1.5">
            WhatsApp / mobile number
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" aria-hidden />
            <input
              id="checkout-contact-mobile"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={value.mobile}
              onChange={(e) =>
                onChange({ ...value, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })
              }
              placeholder="10-digit number"
              disabled={disabled}
              className={`w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-sm sm:text-base disabled:opacity-60 tabular-nums ${
                mobileErr ? 'border-red-500/60' : 'border-slate-600'
              }`}
            />
          </div>
          {mobileErr ? (
            <p className="mt-1.5 text-xs text-red-400">Enter a valid 10-digit mobile number</p>
          ) : mobileDigits.length === 10 ? (
            <p className="mt-1.5 text-xs text-slate-500">{formatIndianMobileDisplay(mobileDigits)}</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">We&apos;ll use this for order updates on WhatsApp</p>
          )}
        </div>
      </div>

      {showErrors && error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
