'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { PROFILE_PATH } from '@/lib/routes'
import type { ResellerSubModule, ResellerSubStatus } from '@/lib/reseller-subscription'

export function ResellerSubscriptionExpiredScreen({
  access,
  audience = 'reseller',
  module,
  brandName,
}: {
  access?: {
    status?: ResellerSubStatus | string
    headline?: string
    detail?: string
    public_headline?: string
    public_detail?: string
    label?: string
  } | null
  audience?: 'reseller' | 'public'
  module?: ResellerSubModule
  brandName?: string | null
}) {
  const status = access?.status || 'expired'
  const isTrial = status === 'trial_over'
  const title =
    audience === 'public'
      ? access?.public_headline || (isTrial ? 'Free trial over' : 'Subscription expired')
      : access?.headline || (isTrial ? 'Free trial over' : 'Subscription expired')
  const body =
    audience === 'public'
      ? access?.public_detail ||
        (isTrial
          ? 'This catalogue is currently unavailable because the free trial is over.'
          : 'This catalogue is currently unavailable because the subscription has expired.')
      : access?.detail ||
        (module === 'erp'
          ? 'ERP software is not active. Contact KC Jewellers to renew.'
          : 'Website and catalogue access is not active. Contact KC Jewellers to renew.')

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full max-w-md rounded-2xl border border-rose-700/20 bg-white px-5 py-8 shadow-sm sm:px-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-700/15">
          <Clock className="size-7 text-rose-700" aria-hidden />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-800">
          {isTrial ? 'Free trial over' : 'Expired'}
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/70">{body}</p>
        {brandName && audience === 'public' ? (
          <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{brandName}</p>
        ) : null}
        {audience === 'reseller' ? (
          <Link
            href={PROFILE_PATH}
            className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--kc-accent,#047857)] px-5 text-sm font-semibold text-white"
          >
            Go to profile
          </Link>
        ) : null}
      </div>
    </div>
  )
}
