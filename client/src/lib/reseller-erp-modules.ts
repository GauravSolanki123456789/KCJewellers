import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  Calculator,
  CreditCard,
  FileText,
  Gem,
  Layers,
  BookMarked,
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
  Users,
  Wallet,
} from 'lucide-react'
import { RESELLER_ERP_PATH } from '@/lib/routes'

export type ResellerErpModuleId =
  | 'billing'
  | 'sales-bills'
  | 'credit-bills'
  | 'orders'
  | 'estimations'
  | 'customers'
  | 'ledger'
  | 'products'
  | 'hardware'
  | 'stock'
  | 'rol'
  | 'digigold'
  | 'digisilver'
  | 'gst'
  | 'slabs'
  | 'sales-reports'
  | 'sales-percentages'
  | 'barcoding'
  | 'tag-splitting'
  | 'scanner'
  | 'rate-uncut'
  | 'e-invoice'
  | 'e-way'
  | 'tally'
  | 'integrations'

export type ResellerErpModule = {
  id: ResellerErpModuleId
  title: string
  short: string
  description: string
  icon: LucideIcon
  group: 'sales' | 'inventory' | 'crm' | 'rates' | 'compliance' | 'tools'
  /** Live CRUD / API workspace vs settings / guided workspace */
  kind: 'workspace' | 'settings' | 'link'
  href?: string
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
    id: 'stock',
    title: 'Stock management',
    short: 'Stock',
    description: '',
    icon: Package,
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
  },
  {
    id: 'digigold',
    title: 'DigiGold',
    short: 'DigiGold',
    description: '',
    icon: Gem,
    group: 'rates',
    kind: 'workspace',
  },
  {
    id: 'digisilver',
    title: 'DigiSilver',
    short: 'DigiSilver',
    description: '',
    icon: Wallet,
    group: 'rates',
    kind: 'workspace',
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
    id: 'sales-percentages',
    title: 'Sales percentages',
    short: 'Mix %',
    description: '',
    icon: Percent,
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
    id: 'integrations',
    title: 'Integrations hub',
    short: 'APIs',
    description: '',
    icon: Settings2,
    group: 'compliance',
    kind: 'settings',
  },
]

export const RESELLER_ERP_GROUPS: { id: ResellerErpModule['group']; label: string }[] = [
  { id: 'sales', label: 'Sales & billing' },
  { id: 'crm', label: 'Customers' },
  { id: 'inventory', label: 'Stock & ROL' },
  { id: 'rates', label: 'Rates & digi' },
  { id: 'compliance', label: 'GST & compliance' },
  { id: 'tools', label: 'Tags & scanners' },
]

export function getResellerErpModule(id: string | undefined | null): ResellerErpModule | null {
  if (!id) return null
  return RESELLER_ERP_MODULES.find((m) => m.id === id) ?? null
}

export function resellerErpModulePath(id: ResellerErpModuleId | string): string {
  return `${RESELLER_ERP_PATH}/${id}`
}

export function formatErpInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
