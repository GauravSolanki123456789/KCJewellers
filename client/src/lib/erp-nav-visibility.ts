import type { ResellerErpModuleId } from '@/lib/reseller-erp-modules'

/** Always hidden until Jainav unlock — not overridable by tab layout save. */
export const JAINAV_ONLY_MODULE_IDS: ResellerErpModuleId[] = [
  'rol',
  'jainav',
  'stock-reports',
  'jainav-ledger',
]

/** Single list: tabs hidden in admin mode until Jainav unlock (F9Rs* + Enter). */
export type ErpNavVisibility = {
  jainavUnlockTabs: ResellerErpModuleId[]
}

/** All ERP workspace modules shown in quick-nav / hub (excludes removed modules). */
export const ERP_NAV_MODULE_ORDER: ResellerErpModuleId[] = [
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
  'rol',
  'slabs',
  'gst',
  'hardware',
  'print-formats',
  'erp-users',
  'jainav',
  'stock-reports',
  'jainav-ledger',
]

/** Primary tabs for staff quick navigation */
export const ERP_QUICK_NAV_IDS: ResellerErpModuleId[] = [
  'billing',
  'sales-bills',
  'credit-bills',
  'orders',
  'estimations',
  'sales-reports',
  'customers',
  'ledger',
  'jainav',
  'stock-reports',
  'jainav-ledger',
]

/** Default: these tabs require Jainav unlock for admin */
export const DEFAULT_ERP_JAINAV_UNLOCK_TABS: ResellerErpModuleId[] = [
  'jainav',
  'stock-reports',
  'jainav-ledger',
  'rol',
]

export const DEFAULT_ERP_NAV_VISIBILITY: ErpNavVisibility = {
  jainavUnlockTabs: DEFAULT_ERP_JAINAV_UNLOCK_TABS,
}

const VALID_NAV_IDS = new Set<string>(ERP_NAV_MODULE_ORDER)

export function normalizeErpNavVisibility(raw: unknown): ErpNavVisibility {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const pick = (arr: unknown): ResellerErpModuleId[] => {
    if (!Array.isArray(arr)) return []
    return arr
      .map((x) => String(x))
      .filter((id): id is ResellerErpModuleId => VALID_NAV_IDS.has(id))
  }

  const mergeMandatory = (ids: ResellerErpModuleId[]) => {
    const set = new Set<ResellerErpModuleId>(ids)
    for (const id of JAINAV_ONLY_MODULE_IDS) set.add(id)
    return Array.from(set).filter((id) => VALID_NAV_IDS.has(id))
  }

  // New format: { jainavUnlockTabs: [...] }
  if (Array.isArray(obj.jainavUnlockTabs)) {
    const ids = pick(obj.jainavUnlockTabs)
    return {
      jainavUnlockTabs: mergeMandatory(ids.length ? ids : DEFAULT_ERP_JAINAV_UNLOCK_TABS),
    }
  }

  // Legacy format: { adminTabs, jainavTabs } — only jainavTabs defines unlock-only tabs
  if (Array.isArray(obj.jainavTabs)) {
    const ids = pick(obj.jainavTabs)
    return {
      jainavUnlockTabs: mergeMandatory(ids.length ? ids : DEFAULT_ERP_JAINAV_UNLOCK_TABS),
    }
  }

  return {
    jainavUnlockTabs: mergeMandatory(DEFAULT_ERP_JAINAV_UNLOCK_TABS),
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
  const hidden = new Set<string>([...vis.jainavUnlockTabs, ...JAINAV_ONLY_MODULE_IDS])
  const visible = new Set<string>(ERP_NAV_MODULE_ORDER)

  if (!opts.jainavUnlocked) {
    for (const id of hidden) visible.delete(id)
  }

  return visible
}

/** True when this tab is hidden until Jainav unlock (admin-configured only). */
export function moduleRequiresJainavUnlock(
  moduleId: string,
  navVisibility?: ErpNavVisibility | null,
): boolean {
  const vis = navVisibility ?? DEFAULT_ERP_NAV_VISIBILITY
  if (JAINAV_ONLY_MODULE_IDS.includes(moduleId as ResellerErpModuleId)) return true
  return vis.jainavUnlockTabs.includes(moduleId as ResellerErpModuleId)
}

export function orderNavModuleIds(ids: Set<string>): ResellerErpModuleId[] {
  const ordered: ResellerErpModuleId[] = ERP_NAV_MODULE_ORDER.filter((id) => ids.has(id))
  for (const id of ids) {
    if (!ordered.includes(id as ResellerErpModuleId)) ordered.push(id as ResellerErpModuleId)
  }
  return ordered
}
