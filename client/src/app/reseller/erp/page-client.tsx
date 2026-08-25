'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import { ChevronRight } from 'lucide-react'
import { PROFILE_PATH } from '@/lib/routes'
import {
  RESELLER_ERP_GROUPS,
  RESELLER_ERP_JAINAV_GROUP,
  formatErpInr,
  listErpModulesForHub,
  resellerErpModulePath,
} from '@/lib/reseller-erp-modules'
import { ResellerErpAccessGate, ResellerErpShell } from '@/components/reseller/erp/ResellerErpShell'
import { ErpOperatorGate } from '@/components/reseller/erp/ErpOperatorLogin'
import { useErpOperator } from '@/context/ErpOperatorContext'

type ErpStatus = {
  enabled: boolean
  summary: {
    customers: number
    bills: number
    billTotalInr: number
    stockItems: number
    belowRol: number
  } | null
}

function ErpHubContent() {
  const [status, setStatus] = useState<ErpStatus | null>(null)
  const { canAccessModule, shadowUnlocked } = useErpOperator()

  const load = useCallback(async () => {
    try {
      const res = await axios.get<ErpStatus>('/api/reseller/erp/status')
      setStatus(res.data)
    } catch {
      setStatus({ enabled: true, summary: null })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = status?.summary

  return (
    <ResellerErpShell
      title="ERP workspace"
      backHref={PROFILE_PATH}
      backLabel="Back to profile"
    >
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Customers', value: summary ? String(summary.customers) : '—' },
          { label: 'Bills / estimates', value: summary ? String(summary.bills) : '—' },
          {
            label: 'Bill value',
            value: summary ? formatErpInr(summary.billTotalInr) : '—',
          },
          {
            label: 'Below ROL',
            value: summary ? String(summary.belowRol) : '—',
            accent: (summary?.belowRol ?? 0) > 0,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3.5 shadow-sm"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              {card.label}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                card.accent
                  ? 'text-[var(--kc-accent,#c41e3a)]'
                  : 'text-[var(--color-jewelry-black,#1a1814)]'
              }`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-7">
        {[...RESELLER_ERP_GROUPS, ...(shadowUnlocked ? [RESELLER_ERP_JAINAV_GROUP] : [])].map((group) => {
          const mods = listErpModulesForHub({
            canAccess: canAccessModule,
            jainavUnlocked: shadowUnlocked,
          }).filter((m) => m.group === group.id)
          if (!mods.length) return null
          return (
            <section key={group.id}>
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-jewelry-black,#1a1814)]/45">
                {group.label}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {mods.map((mod) => {
                  const Icon = mod.icon
                  const href = mod.kind === 'link' && mod.href ? mod.href : resellerErpModulePath(mod.id)
                  return (
                    <li key={mod.id}>
                      <Link
                        href={href}
                        className="group flex min-h-[3.25rem] items-center gap-3 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3.5 py-3 shadow-sm transition hover:border-[var(--kc-accent,#c41e3a)]/35 hover:bg-[var(--kc-accent,#c41e3a)]/[0.04] active:scale-[0.99]"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--kc-accent,#c41e3a)]/10 ring-1 ring-[var(--kc-accent,#c41e3a)]/20">
                          <Icon className="size-[1.125rem] text-[var(--kc-accent,#c41e3a)]" aria-hidden />
                        </div>
                        <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                          {mod.title}
                        </p>
                        <ChevronRight className="size-4 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/30 group-hover:text-[var(--kc-accent,#c41e3a)]" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </ResellerErpShell>
  )
}

export default function ResellerErpHubPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading ERP…
        </div>
      }
    >
      <ResellerErpAccessGate>
        <ErpOperatorGate>
          <ErpHubContent />
        </ErpOperatorGate>
      </ResellerErpAccessGate>
    </Suspense>
  )
}
