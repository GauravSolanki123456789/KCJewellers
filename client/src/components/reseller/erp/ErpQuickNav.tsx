'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import { useErpOperator } from '@/context/ErpOperatorContext'
import {
  listErpQuickNavModules,
  resellerErpModulePath,
} from '@/lib/reseller-erp-modules'
import { RESELLER_ERP_PATH } from '@/lib/routes'

function activeModuleId(pathname: string): string | null {
  if (!pathname.startsWith('/reseller/erp')) return null
  if (pathname === '/reseller/erp' || pathname === '/reseller/erp/') return 'hub'
  const rest = pathname.replace(/^\/reseller\/erp\/?/, '')
  const seg = rest.split('/')[0]
  if (seg === 'shadow') return 'jainav'
  return seg || null
}

export function ErpQuickNav() {
  const pathname = usePathname() || ''
  const { shadowUnlocked, lockShadow, operator, canAccessModule } = useErpOperator()
  const active = activeModuleId(pathname)
  const mods = listErpQuickNavModules({
    canAccess: canAccessModule,
    jainavUnlocked: shadowUnlocked,
  })

  if (!operator || !mods.length) return null

  return (
    <div className="mb-4">
      <nav
        className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin"
        aria-label="ERP modules"
      >
        <Link
          href={RESELLER_ERP_PATH}
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
            active === 'hub'
              ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
              : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:border-[var(--kc-accent,#c41e3a)]/30'
          }`}
        >
          ERP home
        </Link>
        {mods.map((mod) => {
          const href = resellerErpModulePath(mod.id)
          const isActive = active === mod.id
          return (
            <Link
              key={mod.id}
              href={href}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? mod.jainavOnly
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                  : mod.jainavOnly
                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:border-emerald-400'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:border-[var(--kc-accent,#c41e3a)]/30'
              }`}
            >
              {mod.short || mod.title}
            </Link>
          )
        })}
        {shadowUnlocked ? (
          <button
            type="button"
            className="ml-auto shrink-0 inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
            onClick={() => void lockShadow()}
            title="Lock extra tabs"
          >
            <Lock className="size-3.5" />
            Lock
          </button>
        ) : null}
      </nav>
    </div>
  )
}

export function ErpJainavGate({ children }: { children: React.ReactNode }) {
  const { shadowUnlocked, operator } = useErpOperator()

  if (!operator?.shadowAccess) {
    return (
      <p className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-6 text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
        You do not have access to this area.
      </p>
    )
  }

  if (!shadowUnlocked) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-6 text-sm text-amber-950">
        <p className="font-semibold">This section is locked</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
          Sign in as admin, then type your secret key (default <span className="font-mono">F9Rs*</span>){' '}
          and press Enter from any ERP screen.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
