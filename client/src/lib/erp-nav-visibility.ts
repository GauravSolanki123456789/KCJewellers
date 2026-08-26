import type { ResellerErpModuleId } from '@/lib/reseller-erp-modules'
import { ERP_QUICK_NAV_IDS, RESELLER_ERP_MODULES } from '@/lib/reseller-erp-modules'

export type ErpNavVisibility = {
  /** Tabs visible when admin is logged in (before F9Rs* unlock) */
  adminTabs: ResellerErpModuleId[]
  /** Extra tabs visible only after F9Rs* unlock */
  jainavTabs: ResellerErpModuleId[]
}

/** Default quick-nav tabs for normal admin mode */
export const DEFAULT_ERP_ADMIN_TABS: ResellerErpModuleId[] = [
  'billing',
  'sales-bills',
  'credit-bills',
  'orders',
  'estimations',
  'sales-reports',
  'customers',
  'ledger',
  'products',
  'design-master',
  'floors',
  'hardware',
  'gst',
  'stock',
]

/** Default tabs that appear only after F9Rs* unlock */
export const DEFAULT_ERP_JAINAV_TABS: ResellerErpModuleId[] = [
  'jainav',
  'stock-reports',
  'jainav-ledger',
  'rol',
]

export const DEFAULT_ERP_NAV_VISIBILITY: ErpNavVisibility = {
  adminTabs: DEFAULT_ERP_ADMIN_TABS,
  jainavTabs: DEFAULT_ERP_JAINAV_TABS,
}

export const ERP_NAV_PICKER_MODULES = RESELLER_ERP_MODULES.filter(
  (m) => m.id !== 'shadow' && m.kind === 'workspace',
)

export function normalizeErpNavVisibility(raw: unknown): ErpNavVisibility {
  const validIds = new Set(RESELLER_ERP_MODULES.map((m) => m.id))
  const pick = (arr: unknown, fallback: ResellerErpModuleId[]) => {
    if (!Array.isArray(arr)) return fallback
    const ids = arr
      .map((x) => String(x))
      .filter((id): id is ResellerErpModuleId => validIds.has(id as ResellerErpModuleId))
    return ids.length ? ids : fallback
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    adminTabs: pick(obj.adminTabs, DEFAULT_ERP_ADMIN_TABS),
    jainavTabs: pick(obj.jainavTabs, DEFAULT_ERP_JAINAV_TABS),
  }
}

export function resolveVisibleNavModuleIds(opts: {
  jainavUnlocked: boolean
  isAdminOperator: boolean
  navVisibility?: ErpNavVisibility | null
}): Set<string> {
  if (!opts.isAdminOperator) {
    return new Set(ERP_QUICK_NAV_IDS)
  }
  const vis = opts.navVisibility ?? DEFAULT_ERP_NAV_VISIBILITY
  const ids = new Set<string>(vis.adminTabs)
  if (opts.jainavUnlocked) {
    for (const id of vis.jainavTabs) ids.add(id)
  }
  return ids
}

export function moduleRequiresJainavUnlock(
  moduleId: string,
  navVisibility?: ErpNavVisibility | null,
): boolean {
  const vis = navVisibility ?? DEFAULT_ERP_NAV_VISIBILITY
  if (vis.jainavTabs.includes(moduleId as ResellerErpModuleId)) return true
  const mod = RESELLER_ERP_MODULES.find((m) => m.id === moduleId)
  return !!mod?.jainavOnly
}

export function orderNavModuleIds(ids: Set<string>): ResellerErpModuleId[] {
  const ordered: ResellerErpModuleId[] = ERP_QUICK_NAV_IDS.filter((id) => ids.has(id))
  for (const id of ids) {
    if (!ordered.includes(id as ResellerErpModuleId)) ordered.push(id as ResellerErpModuleId)
  }
  return ordered
}
