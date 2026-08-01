'use client'

import { Suspense, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { getResellerErpModule, type ResellerErpModuleId } from '@/lib/reseller-erp-modules'
import { ResellerErpAccessGate, ResellerErpShell } from '@/components/reseller/erp/ResellerErpShell'
import { erpBtnPrimary } from '@/components/reseller/erp/erp-ui'
import { ErpBillingWorkspace } from '@/components/reseller/erp/ErpBillingWorkspace'
import { ErpEstimationsWorkspace } from '@/components/reseller/erp/ErpEstimationsWorkspace'
import { ErpSalesBillsWorkspace } from '@/components/reseller/erp/ErpSalesBillsWorkspace'
import { ErpHardwareWorkspace } from '@/components/reseller/erp/ErpHardwareWorkspace'
import { ErpProductsWorkspace } from '@/components/reseller/erp/ErpProductsWorkspace'
import { ErpDigiWorkspace } from '@/components/reseller/erp/ErpDigiWorkspace'
import {
  BillsWorkspace,
  CustomersWorkspace,
  ErpFallbackPanel,
  IntegrationsWorkspace,
  ReportsWorkspace,
  ScannerWorkspace,
  SettingsWorkspace,
  SlabsLinkPanel,
  StockWorkspace,
} from '@/components/reseller/erp/ResellerErpWorkspaces'

function ModuleBody({ moduleId }: { moduleId: ResellerErpModuleId }) {
  switch (moduleId) {
    case 'customers':
      return <CustomersWorkspace />
    case 'products':
      return <ErpProductsWorkspace />
    case 'hardware':
      return <ErpHardwareWorkspace />
    case 'billing':
      return (
        <Suspense fallback={<div className="py-8 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">Loading billing…</div>}>
          <ErpBillingWorkspace />
        </Suspense>
      )
    case 'sales-bills':
      return <ErpSalesBillsWorkspace />
    case 'credit-bills':
      return <BillsWorkspace billTypeFilter="credit" />
    case 'orders':
      return <BillsWorkspace billTypeFilter="order" />
    case 'estimations':
      return <ErpEstimationsWorkspace />
    case 'stock':
      return <StockWorkspace />
    case 'rol':
      return <StockWorkspace rolOnly />
    case 'digigold':
      return <ErpDigiWorkspace metal="gold" />
    case 'digisilver':
      return <ErpDigiWorkspace metal="silver" />
    case 'sales-reports':
      return <ReportsWorkspace />
    case 'sales-percentages':
      return <ReportsWorkspace percentagesOnly />
    case 'slabs':
      return <SlabsLinkPanel />
    case 'scanner':
      return <ScannerWorkspace />
    case 'integrations':
      return <IntegrationsWorkspace />
    case 'gst':
      return (
        <SettingsWorkspace
          settingsKey="gst"
          fields={[
            { key: 'gstin', label: 'Business GSTIN', placeholder: '22AAAAA0000A1Z5' },
            { key: 'legalName', label: 'Legal name' },
            { key: 'placeOfSupply', label: 'Place of supply' },
          ]}
        />
      )
    case 'e-invoice':
      return (
        <SettingsWorkspace
          settingsKey="einvoice"
          fields={[
            { key: 'apiUrl', label: 'E-invoice API URL' },
            { key: 'apiKey', label: 'API key / username' },
            { key: 'apiSecret', label: 'API secret', type: 'password' },
          ]}
        />
      )
    case 'e-way':
      return (
        <SettingsWorkspace
          settingsKey="eway"
          fields={[
            { key: 'apiUrl', label: 'E-way bill API URL' },
            { key: 'apiKey', label: 'API key' },
            { key: 'gstin', label: 'Transporter GSTIN' },
          ]}
        />
      )
    case 'tally':
      return (
        <SettingsWorkspace
          settingsKey="tally"
          fields={[
            { key: 'company', label: 'Tally company name' },
            { key: 'serverUrl', label: 'Tally / API endpoint' },
            { key: 'notes', label: 'Sync notes' },
          ]}
        />
      )
    case 'rate-uncut':
      return (
        <SettingsWorkspace
          settingsKey="rateUncut"
          fields={[
            { key: 'silverUncut', label: 'Silver uncut ₹/g' },
            { key: 'goldUncut', label: 'Gold uncut ₹/g' },
            { key: 'notes', label: 'Notes' },
          ]}
        />
      )
    case 'barcoding':
      return (
        <SettingsWorkspace
          settingsKey="barcoding"
          fields={[
            { key: 'labelFormat', label: 'Label format' },
            { key: 'prefix', label: 'Barcode prefix' },
            { key: 'notes', label: 'Notes' },
          ]}
        />
      )
    case 'tag-splitting':
      return (
        <SettingsWorkspace
          settingsKey="tagSplit"
          fields={[
            { key: 'rules', label: 'Split / merge rules' },
            { key: 'notes', label: 'Staff SOP notes' },
          ]}
        />
      )
    default:
      return <ErpFallbackPanel />
  }
}

function ModulePageContent() {
  const params = useParams()
  const raw = typeof params?.module === 'string' ? params.module : Array.isArray(params?.module) ? params.module[0] : ''
  const mod = useMemo(() => getResellerErpModule(raw), [raw])

  if (!mod) {
    return (
      <ResellerErpShell title="Module not found">
        <Link href={RESELLER_ERP_PATH} className={erpBtnPrimary}>
          ERP home
        </Link>
      </ResellerErpShell>
    )
  }

  return (
    <ResellerErpShell title={mod.title}>
      <ModuleBody moduleId={mod.id} />
    </ResellerErpShell>
  )
}

export default function ResellerErpModulePageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/60">
          Loading module…
        </div>
      }
    >
      <ResellerErpAccessGate>
        <ModulePageContent />
      </ResellerErpAccessGate>
    </Suspense>
  )
}
