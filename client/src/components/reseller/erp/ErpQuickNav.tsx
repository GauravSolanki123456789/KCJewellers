'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { useErpNavVisibility } from '@/hooks/useErpNavVisibility'
import {
  isJainavModule,
  listErpQuickNavModules,
  resellerErpModulePath,
} from '@/lib/reseller-erp-modules'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { erpBtnGhost } from '@/components/reseller/erp/erp-ui'

const NAV_SCROLL_KEY = 'erp-quick-nav-scroll-left'

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
  const navRef = useRef<HTMLElement>(null)
  const scrollLeftRef = useRef(0)
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

  const persistScroll = () => {
    const el = navRef.current
    if (!el) return
    scrollLeftRef.current = el.scrollLeft
    sessionStorage.setItem(NAV_SCROLL_KEY, String(el.scrollLeft))
  }

  useLayoutEffect(() => {
    const el = navRef.current
    if (!el) return
    const saved = scrollLeftRef.current || Number(sessionStorage.getItem(NAV_SCROLL_KEY)) || 0
    el.scrollLeft = saved
    const activeLink = el.querySelector<HTMLElement>('[data-nav-active="true"]')
    if (activeLink) {
      activeLink.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      scrollLeftRef.current = el.scrollLeft
      sessionStorage.setItem(NAV_SCROLL_KEY, String(el.scrollLeft))
    }
  }, [pathname, active])

  const handleLock = async () => {
    await lockShadow()
    router.push(RESELLER_ERP_PATH)
  }

  if (!operator || !mods.length) return null

  return (
    <div className="mb-4 space-y-2">
      <nav
        ref={navRef}
        className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 pr-4 [scrollbar-width:thin]"
        aria-label="ERP modules"
        onScroll={persistScroll}
      >
        <Link
          href={RESELLER_ERP_PATH}
          data-nav-active={active === 'hub' ? 'true' : undefined}
          onClick={persistScroll}
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
          const jainavTab = shadowUnlocked && isJainavModule(mod, navVisibility)
          return (
            <Link
              key={mod.id}
              href={href}
              data-nav-active={isActive ? 'true' : undefined}
              onClick={persistScroll}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                isActive
                  ? jainavTab
                    ? 'border-emerald-800 bg-emerald-800 !text-white shadow-sm'
                    : 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                  : jainavTab
                    ? 'border-emerald-600 bg-white !text-[#1a1814] shadow-sm ring-1 ring-emerald-200 hover:border-emerald-700 hover:bg-emerald-50'
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
