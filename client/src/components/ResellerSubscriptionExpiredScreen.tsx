'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { PROFILE_PATH } from '@/lib/routes'
import { resellerSubscriptionBlockedLabel, type ResellerSubModule, type ResellerSubStatus } from '@/lib/reseller-subscription'

export function ResellerSubscriptionExpiredScreen({
  access,
  audience = 'reseller',
  brandName,
}: {
  access?: {
    status?: ResellerSubStatus | string
    headline?: string
    hasAccess?: boolean
  } | null
  audience?: 'reseller' | 'public'
  module?: ResellerSubModule
  brandName?: string | null
}) {
  const title =
    resellerSubscriptionBlockedLabel(
      access
        ? {
            status: (access.status as ResellerSubStatus) || 'expired',
            headline: access.headline,
            hasAccess: false,
          }
        : null,
    ) || 'Subscription expired'

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="w-full max-w-md rounded-2xl border border-rose-700/20 bg-white px-5 py-8 shadow-sm sm:px-8">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 ring-1 ring-rose-700/15">
          <Clock className="size-7 text-rose-700" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">{title}</h1>
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
