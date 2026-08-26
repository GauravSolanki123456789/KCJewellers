'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { useErpNavVisibility } from '@/hooks/useErpNavVisibility'
import {
  listErpQuickNavModules,
  resellerErpModulePath,
} from '@/lib/reseller-erp-modules'
import { moduleRequiresJainavUnlock } from '@/lib/erp-nav-visibility'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { erpBtnGhost } from '@/components/reseller/erp/erp-ui'

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
  const router = useRouter()
  const { shadowUnlocked, lockShadow, operator, canAccessModule } = useErpOperator()
  const { navVisibility } = useErpNavVisibility()
  const active = activeModuleId(pathname)
  const isAdmin = operator?.role === 'admin'
  const mods = listErpQuickNavModules({
    canAccess: canAccessModule,
    jainavUnlocked: shadowUnlocked,
    isAdminOperator: isAdmin,
    navVisibility,
  })

  const handleLock = async () => {
    await lockShadow()
    router.push(RESELLER_ERP_PATH)
  }

  if (!operator || !mods.length) return null

  return (
    <div className="mb-4 space-y-2">
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
          const jainavTab = isAdmin && moduleRequiresJainavUnlock(mod.id, navVisibility)
          return (
            <Link
              key={mod.id}
              href={href}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? jainavTab
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                  : jainavTab
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400'
                    : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:border-[var(--kc-accent,#c41e3a)]/30'
              }`}
            >
              {mod.short || mod.title}
            </Link>
          )
        })}
      </nav>
      {shadowUnlocked ? (
        <div className="flex justify-end">
          <button
            type="button"
            className={`${erpBtnGhost} min-h-[40px] gap-1.5 px-4 text-xs font-semibold`}
            onClick={() => void handleLock()}
            title="Lock Jainav mode and return to ERP home"
          >
            <Lock className="size-3.5" />
            Lock Jainav mode
          </button>
        </div>
      ) : null}
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
    return null
  }

  return <>{children}</>
}
