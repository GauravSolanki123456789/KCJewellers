import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  Calculator,
  CreditCard,
  FileText,
  Layers,
  BookMarked,
  LayoutTemplate,
  Package,
  Percent,
  Printer,
  QrCode,
  Receipt,
  ScanLine,
  Settings2,
  ShoppingBag,
  Split,
  Tags,
  Truck,
  UserCog,
  Users,
  Vault,
  Warehouse,
} from 'lucide-react'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import type { ErpNavVisibility } from '@/lib/erp-nav-visibility'
import {
  DEFAULT_ERP_NAV_VISIBILITY,
  ERP_QUICK_NAV_IDS,
  moduleRequiresJainavUnlock,
  orderNavModuleIds,
  resolveVisibleNavModuleIds,
} from '@/lib/erp-nav-visibility'

export type ResellerErpModuleId =
  | 'billing'
  | 'sales-bills'
  | 'credit-bills'
  | 'orders'
  | 'estimations'
  | 'customers'
  | 'ledger'
  | 'products'
  | 'design-master'
  | 'floors'
  | 'hardware'
  | 'print-formats'
  | 'rol'
  | 'gst'
  | 'slabs'
  | 'sales-reports'
  | 'barcoding'
  | 'tag-splitting'
  | 'scanner'
  | 'rate-uncut'
  | 'e-invoice'
  | 'e-way'
  | 'tally'
  | 'integrations'
  | 'erp-users'
  | 'jainav'
  | 'stock-reports'
  | 'jainav-ledger'
  /** @deprecated use jainav */
  | 'shadow'

export type ResellerErpModule = {
  id: ResellerErpModuleId
  title: string
  short: string
  description: string
  icon: LucideIcon
  group: 'sales' | 'inventory' | 'crm' | 'rates' | 'compliance' | 'tools' | 'jainav'
  /** Live CRUD / API workspace vs settings / guided workspace */
  kind: 'workspace' | 'settings' | 'link'
  href?: string
  /** Visible only after Jainav mode unlock (F9Rs* + Enter) */
  jainavOnly?: boolean
}

export const RESELLER_ERP_MODULES: ResellerErpModule[] = [
  {
    id: 'billing',
    title: 'Billing',
    short: 'Scan & bill',
    description: '',
    icon: Receipt,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'sales-bills',
    title: 'Sales bills',
    short: 'Completed sales',
    description: '',
    icon: FileText,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'credit-bills',
    title: 'Credit bills',
    short: 'Credit notes',
    description: '',
    icon: CreditCard,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'orders',
    title: 'Order management',
    short: 'Orders',
    description: '',
    icon: ShoppingBag,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'estimations',
    title: 'Estimation tracking',
    short: 'Estimates',
    description: '',
    icon: Calculator,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'customers',
    title: 'Customers',
    short: 'CRM',
    description: '',
    icon: Users,
    group: 'crm',
    kind: 'workspace',
  },
  {
    id: 'ledger',
    title: 'Payment ledger',
    short: 'Ledger',
    description: '',
    icon: BookMarked,
    group: 'crm',
    kind: 'workspace',
  },
  {
    id: 'products',
    title: 'Products',
    short: 'Stock upload',
    description: '',
    icon: Package,
    group: 'inventory',
    kind: 'workspace',
  },
  {
    id: 'design-master',
    title: 'Design master',
    short: 'Designs',
    description: 'Style & SKU calculation defaults for stock autofill',
    icon: Layers,
    group: 'inventory',
    kind: 'workspace',
  },
  {
    id: 'floors',
    title: 'Floors & boxes',
    short: 'Floors',
    description: 'Track where stock is placed — floors, boxes & QR labels',
    icon: Building2,
    group: 'inventory',
    kind: 'workspace',
  },
  {
    id: 'rol',
    title: 'Reorder levels (ROL)',
    short: 'ROL',
    description: '',
    icon: Tags,
    group: 'inventory',
    kind: 'workspace',
    jainavOnly: true,
  },
  {
    id: 'rate-uncut',
    title: 'Rate uncut',
    short: 'Uncut rates',
    description: '',
    icon: Percent,
    group: 'rates',
    kind: 'settings',
  },
  {
    id: 'slabs',
    title: 'MC slabs',
    short: 'Slabs',
    description: '',
    icon: Layers,
    group: 'rates',
    kind: 'workspace',
  },
  {
    id: 'sales-reports',
    title: 'Sales reports',
    short: 'Reports',
    description: '',
    icon: BarChart3,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'gst',
    title: 'GST',
    short: 'GST',
    description: '',
    icon: FileText,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'e-invoice',
    title: 'E-invoice API',
    short: 'E-invoice',
    description: '',
    icon: Building2,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'e-way',
    title: 'E-way bill API',
    short: 'E-way',
    description: '',
    icon: Truck,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'tally',
    title: 'Tally connectivity',
    short: 'Tally',
    description: '',
    icon: Settings2,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'barcoding',
    title: 'Barcoding',
    short: 'Barcodes',
    description: '',
    icon: QrCode,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'tag-splitting',
    title: 'Tag splitting',
    short: 'Tag split',
    description: '',
    icon: Split,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'scanner',
    title: 'QR / barcode scanner',
    short: 'Scanner',
    description: '',
    icon: ScanLine,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'hardware',
    title: 'Hardware',
    short: 'Printers',
    description: '',
    icon: Printer,
    group: 'tools',
    kind: 'workspace',
  },
  {
    id: 'print-formats',
    title: 'Print formats',
    short: 'Templates',
    description: 'Label PRN & bill receipt layout',
    icon: LayoutTemplate,
    group: 'tools',
    kind: 'workspace',
  },
  {
    id: 'integrations',
    title: 'Integrations hub',
    short: 'APIs',
    description: '',
    icon: Settings2,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'erp-users',
    title: 'ERP staff logins',
    short: 'Staff logins',
    description: 'Usernames, passwords & tab access',
    icon: UserCog,
    group: 'tools',
    kind: 'workspace',
  },
  {
    id: 'jainav',
    title: 'Hitesh & Jainav',
    short: 'Day close',
    description: 'Lane billing · export · purge',
    icon: Vault,
    group: 'jainav',
    kind: 'workspace',
    jainavOnly: true,
  },
  {
    id: 'stock-reports',
    title: 'Stock reports',
    short: 'Inventory',
    description: 'Detailed or summary stock · PDF / Excel',
    icon: Warehouse,
    group: 'jainav',
    kind: 'workspace',
    jainavOnly: true,
  },
  {
    id: 'jainav-ledger',
    title: 'Jainav ledger',
    short: 'Lane ledger',
    description: 'Hitesh & Jainav bills ledger (separate from payment ledger)',
    icon: BookMarked,
    group: 'jainav',
    kind: 'workspace',
    jainavOnly: true,
  },
]

export { ERP_QUICK_NAV_IDS } from '@/lib/erp-nav-visibility'

export const RESELLER_ERP_JAINAV_GROUP = { id: 'jainav' as const, label: 'Jainav mode' }

export const RESELLER_ERP_GROUPS: { id: ResellerErpModule['group']; label: string }[] = [
  { id: 'sales', label: 'Sales & billing' },
  { id: 'crm', label: 'Customers' },
  { id: 'inventory', label: 'Stock & ROL' },
  { id: 'rates', label: 'Rates & slabs' },
  { id: 'compliance', label: 'GST & compliance' },
  { id: 'tools', label: 'Tags & scanners' },
]

export function getResellerErpModule(id: string | undefined | null): ResellerErpModule | null {
  if (!id) return null
  const normalized = id === 'shadow' ? 'jainav' : id
  return RESELLER_ERP_MODULES.find((m) => m.id === normalized) ?? null
}

export function isJainavModule(mod: ResellerErpModule | null, navVisibility?: ErpNavVisibility | null): boolean {
  if (!mod) return false
  return moduleRequiresJainavUnlock(mod.id, navVisibility) || !!mod.jainavOnly
}

export function listErpModulesForHub(opts: {
  canAccess: (id: ResellerErpModuleId | string) => boolean
  jainavUnlocked: boolean
  isAdminOperator?: boolean
  navVisibility?: ErpNavVisibility | null
}): ResellerErpModule[] {
  const isAdmin = opts.isAdminOperator === true
  if (isAdmin) {
    const visible = resolveVisibleNavModuleIds({
      jainavUnlocked: opts.jainavUnlocked,
      isAdminOperator: true,
      navVisibility: opts.navVisibility,
    })
    return RESELLER_ERP_MODULES.filter((m) => {
      if (m.id === 'shadow') return false
      if (!visible.has(m.id)) return false
      return opts.canAccess(m.id)
    })
  }
  return RESELLER_ERP_MODULES.filter((m) => {
    if (m.id === 'shadow') return false
    if (m.jainavOnly && !opts.jainavUnlocked) return false
    return opts.canAccess(m.id)
  })
}

export function listErpQuickNavModules(opts: {
  canAccess: (id: ResellerErpModuleId | string) => boolean
  jainavUnlocked: boolean
  isAdminOperator?: boolean
  navVisibility?: ErpNavVisibility | null
}): ResellerErpModule[] {
  const isAdmin = opts.isAdminOperator === true
  if (isAdmin) {
    const visible = resolveVisibleNavModuleIds({
      jainavUnlocked: opts.jainavUnlocked,
      isAdminOperator: true,
      navVisibility: opts.navVisibility ?? DEFAULT_ERP_NAV_VISIBILITY,
    })
    return orderNavModuleIds(visible)
      .map((id) => getResellerErpModule(id))
      .filter((m): m is ResellerErpModule => {
        if (!m) return false
        return opts.canAccess(m.id)
      })
  }
  return ERP_QUICK_NAV_IDS.map((id) => getResellerErpModule(id)).filter((m): m is ResellerErpModule => {
    if (!m) return false
    if (m.jainavOnly && !opts.jainavUnlocked) return false
    return opts.canAccess(m.id)
  })
}

export function resellerErpModulePath(id: ResellerErpModuleId | string): string {
  return `${RESELLER_ERP_PATH}/${id}`
}

export function formatErpInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
