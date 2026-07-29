import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Building2,
  Calculator,
  CreditCard,
  FileText,
  Gem,
  Layers,
  Package,
  Percent,
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
import { RESELLER_ERP_PATH, RESELLER_MC_SLABS_PATH, RESELLER_RATES_PATH } from '@/lib/routes'

export type ResellerErpModuleId =
  | 'billing'
  | 'credit-bills'
  | 'orders'
  | 'estimations'
  | 'customers'
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
    short: 'Sale bills',
    description: 'Create sale bills, track status, and keep bill history under one roof.',
    icon: Receipt,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'credit-bills',
    title: 'Credit bills',
    short: 'Credit notes',
    description: 'Raise and track credit bills for returns and adjustments.',
    icon: CreditCard,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'orders',
    title: 'Order management',
    short: 'Orders',
    description: 'Capture customer orders, track fulfilment, and follow up from one list.',
    icon: ShoppingBag,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'estimations',
    title: 'Estimation tracking',
    short: 'Estimates',
    description: 'Save estimations with product photos, weights, and follow-up status.',
    icon: Calculator,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'customers',
    title: 'Customers',
    short: 'CRM',
    description: 'Names, mobile, GSTIN, birthdays, anniversaries — so staff never miss a follow-up.',
    icon: Users,
    group: 'crm',
    kind: 'workspace',
  },
  {
    id: 'stock',
    title: 'Stock management',
    short: 'Stock',
    description: 'Track on-hand qty against catalogue SKUs / barcodes.',
    icon: Package,
    group: 'inventory',
    kind: 'workspace',
  },
  {
    id: 'rol',
    title: 'Reorder levels (ROL)',
    short: 'ROL',
    description: 'Set reorder levels and see items that need restocking.',
    icon: Tags,
    group: 'inventory',
    kind: 'workspace',
  },
  {
    id: 'digigold',
    title: 'DigiGold',
    short: 'DigiGold',
    description: 'DigiGold rates and investment tracking for your counter staff.',
    icon: Gem,
    group: 'rates',
    kind: 'link',
    href: RESELLER_RATES_PATH,
  },
  {
    id: 'digisilver',
    title: 'DigiSilver',
    short: 'DigiSilver',
    description: 'DigiSilver rates alongside live silver — keep digi prices in sync.',
    icon: Wallet,
    group: 'rates',
    kind: 'link',
    href: RESELLER_RATES_PATH,
  },
  {
    id: 'rate-uncut',
    title: 'Rate uncut',
    short: 'Uncut rates',
    description: 'Configure uncut / special rate books used on estimates and bills.',
    icon: Percent,
    group: 'rates',
    kind: 'settings',
  },
  {
    id: 'slabs',
    title: 'MC slabs',
    short: 'Slabs',
    description: 'Weight-range MC slabs for catalogues and counter quoting.',
    icon: Layers,
    group: 'rates',
    kind: 'link',
    href: RESELLER_MC_SLABS_PATH,
  },
  {
    id: 'sales-reports',
    title: 'Sales reports',
    short: 'Reports',
    description: '30-day sales totals by bill type — completed, credit, estimates, orders.',
    icon: BarChart3,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'sales-percentages',
    title: 'Sales percentages',
    short: 'Mix %',
    description: 'See completion and mix percentages across bill types.',
    icon: Percent,
    group: 'sales',
    kind: 'workspace',
  },
  {
    id: 'gst',
    title: 'GST',
    short: 'GST',
    description: 'Store GSTIN, place of supply, and GST invoice preferences.',
    icon: FileText,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'e-invoice',
    title: 'E-invoice API',
    short: 'E-invoice',
    description: 'Link your e-invoice API credentials for GST e-invoicing.',
    icon: Building2,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'e-way',
    title: 'E-way bill API',
    short: 'E-way',
    description: 'Link e-way bill API for transport documents on higher-value consignments.',
    icon: Truck,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'tally',
    title: 'Tally connectivity',
    short: 'Tally',
    description: 'Tally company path / API endpoint for ledger sync.',
    icon: Settings2,
    group: 'compliance',
    kind: 'settings',
  },
  {
    id: 'barcoding',
    title: 'Barcoding',
    short: 'Barcodes',
    description: 'Barcode / QR workflow notes and label preferences for tags.',
    icon: QrCode,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'tag-splitting',
    title: 'Tag splitting',
    short: 'Tag split',
    description: 'Guidelines and defaults for splitting / merging jewellery tags.',
    icon: Split,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'scanner',
    title: 'QR / barcode scanner',
    short: 'Scanner',
    description: 'Camera / USB scanner preferences for bill and stock lookups.',
    icon: ScanLine,
    group: 'tools',
    kind: 'settings',
  },
  {
    id: 'integrations',
    title: 'Integrations hub',
    short: 'APIs',
    description: 'Overview of connected APIs — e-invoice, e-way, Tally, SMS.',
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
