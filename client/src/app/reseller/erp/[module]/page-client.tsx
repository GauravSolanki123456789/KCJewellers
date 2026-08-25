'use client'

import { Suspense, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import type { WholesaleUserFields } from '@/lib/customer-tier'
import { PROFILE_DIGI_PATH, RESELLER_ERP_PATH } from '@/lib/routes'
import { getResellerErpModule, type ResellerErpModuleId } from '@/lib/reseller-erp-modules'
import { ResellerErpAccessGate, ResellerErpShell } from '@/components/reseller/erp/ResellerErpShell'
import { erpBtnPrimary } from '@/components/reseller/erp/erp-ui'
import { ErpBillingWorkspace } from '@/components/reseller/erp/ErpBillingWorkspace'
import { ErpEstimationsWorkspace } from '@/components/reseller/erp/ErpEstimationsWorkspace'
import { ErpSalesBillsWorkspace } from '@/components/reseller/erp/ErpSalesBillsWorkspace'
import { ErpLedgerWorkspace } from '@/components/reseller/erp/ErpLedgerWorkspace'
import { ErpHardwareWorkspace } from '@/components/reseller/erp/ErpHardwareWorkspace'
import { ErpPrintFormatsWorkspace } from '@/components/reseller/erp/ErpPrintFormatsWorkspace'
import { ErpDesignMasterWorkspace } from '@/components/reseller/erp/ErpDesignMasterWorkspace'
import { ErpProductsWorkspace } from '@/components/reseller/erp/ErpProductsWorkspace'
import { ErpFloorsWorkspace } from '@/components/reseller/erp/ErpFloorsWorkspace'
import { ErpTagSplitWorkspace } from '@/components/reseller/erp/ErpTagSplitWorkspace'
import { ErpUsersWorkspace } from '@/components/reseller/erp/ErpUsersWorkspace'
import { ErpOperatorGate } from '@/components/reseller/erp/ErpOperatorLogin'
import { ErpJainavGate } from '@/components/reseller/erp/ErpQuickNav'
import { ErpShadowWorkspace } from '@/components/reseller/erp/ErpShadowWorkspace'
import { ErpStockReportWorkspace } from '@/components/reseller/erp/ErpStockReportWorkspace'
import { ErpJainavLedgerWorkspace } from '@/components/reseller/erp/ErpJainavLedgerWorkspace'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { isJainavModule } from '@/lib/reseller-erp-modules'
import { ErpOrderManagementWorkspace } from '@/components/reseller/erp/ErpOrderManagementWorkspace'
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
  const auth = useAuth()
  const rfidEnabled = !!(auth.user as WholesaleUserFields | null)?.reseller_rfid_enabled

  switch (moduleId) {
    case 'customers':
      return <CustomersWorkspace />
    case 'ledger':
      return <ErpLedgerWorkspace />
    case 'products':
      return <ErpProductsWorkspace />
    case 'design-master':
      return <ErpDesignMasterWorkspace />
    case 'floors':
      return <ErpFloorsWorkspace />
    case 'hardware':
      return <ErpHardwareWorkspace />
    case 'print-formats':
      return <ErpPrintFormatsWorkspace />
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
      return <ErpOrderManagementWorkspace />
    case 'estimations':
      return <ErpEstimationsWorkspace />
    case 'stock':
      return <StockWorkspace />
    case 'rol':
      return <StockWorkspace rolOnly />
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
        <div className="space-y-4">
          <SettingsWorkspace
            settingsKey="gst"
            fields={[
              { key: 'gstin', label: 'Business GSTIN', placeholder: '33AADFJ4897R1ZJ' },
              { key: 'legalName', label: 'Legal name / shop name on invoice' },
              {
                key: 'address',
                label: 'Business address (on invoice)',
                placeholder: '2ND FLOOR, OLD NO.34, NEW NO.21, BOTHRA EMPORIUM…',
                multiline: true,
              },
              { key: 'phone', label: 'Phone / contact', placeholder: '044-43593474' },
              { key: 'placeOfSupply', label: 'Place of supply' },
            ]}
          />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
              Payment details (on invoice)
            </p>
            <SettingsWorkspace
              settingsKey="bank"
              fields={[
                { key: 'bankName', label: 'Bank name', placeholder: 'HDFC BANK' },
                { key: 'accountName', label: 'Account name', placeholder: 'JPJEWELLERY' },
                { key: 'accountNo', label: 'Account number' },
                { key: 'ifsc', label: 'IFSC code' },
                { key: 'branch', label: 'Branch' },
              ]}
            />
          </div>
        </div>
      )
    case 'e-invoice':
      return (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
            <span className="font-semibold">GSTZen sandbox:</span> Leave API key empty to use the demo token. Default URL:{' '}
            <span className="font-mono text-[11px]">my.gstzen.in/.../einvoice-json/</span>
          </p>
          <SettingsWorkspace
            settingsKey="einvoice"
            fields={[
              {
                key: 'apiUrl',
                label: 'E-invoice API URL',
                placeholder: 'https://my.gstzen.in/~gstzen/a/post-einvoice-data/einvoice-json/',
              },
              {
                key: 'apiKey',
                label: 'API token (Token header)',
                placeholder: 'Sandbox: de3a3a01-273a-4a81-8b75-13fe37f14dc6',
              },
              { key: 'apiSecret', label: 'API secret (optional)', type: 'password' },
              { key: 'useSandbox', label: 'Use sandbox mode (yes/no)', placeholder: 'yes' },
            ]}
          />
        </div>
      )
    case 'e-way':
      return (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
            E-way uses the same GSTZen token if e-way API key is empty. Default URL:{' '}
            <span className="font-mono text-[11px]">my.gstzen.in/.../ewbapi/create/</span>
          </p>
          <SettingsWorkspace
            settingsKey="eway"
            fields={[
              {
                key: 'apiUrl',
                label: 'E-way bill API URL',
                placeholder: 'https://my.gstzen.in/~gstzen/a/ewbapi/create/',
              },
              { key: 'apiKey', label: 'API token', placeholder: 'Same as e-invoice token' },
              { key: 'gstin', label: 'Transporter GSTIN' },
            ]}
          />
        </div>
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
      return <ErpTagSplitWorkspace rfidEnabled={rfidEnabled} />
    case 'erp-users':
      return <ErpUsersWorkspace />
    case 'jainav':
      return (
        <ErpJainavGate>
          <ErpShadowWorkspace embedded />
        </ErpJainavGate>
      )
    case 'stock-reports':
      return (
        <ErpJainavGate>
          <ErpStockReportWorkspace />
        </ErpJainavGate>
      )
    case 'jainav-ledger':
      return (
        <ErpJainavGate>
          <ErpJainavLedgerWorkspace />
        </ErpJainavGate>
      )
    default:
      return <ErpFallbackPanel />
  }
}

function ModulePageContent() {
  const params = useParams()
  const router = useRouter()
  const { canAccessModule, shadowUnlocked } = useErpOperator()
  const raw = typeof params?.module === 'string' ? params.module : Array.isArray(params?.module) ? params.module[0] : ''
  const mod = useMemo(() => getResellerErpModule(raw), [raw])

  useEffect(() => {
    if (raw === 'shadow') {
      router.replace('/reseller/erp/jainav')
    }
  }, [raw, router])

  useEffect(() => {
    if (raw === 'digigold' || raw === 'digisilver') {
      router.replace(PROFILE_DIGI_PATH)
    }
  }, [raw, router])

  if (raw === 'shadow') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        Redirecting…
      </div>
    )
  }

  if (raw === 'digigold' || raw === 'digisilver') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
        Redirecting to Profile → DigiGold / DigiSilver…
      </div>
    )
  }

  if (!mod) {
    return (
      <ResellerErpShell title="Module not found">
        <Link href={RESELLER_ERP_PATH} className={erpBtnPrimary}>
          ERP home
        </Link>
      </ResellerErpShell>
    )
  }

  if (!canAccessModule(mod.id)) {
    return (
      <ResellerErpShell title="Access denied">
        <p className="mb-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          Your ERP account does not have access to <strong>{mod.title}</strong>.
        </p>
        <Link href={RESELLER_ERP_PATH} className={erpBtnPrimary}>
          Back to ERP home
        </Link>
      </ResellerErpShell>
    )
  }

  if (isJainavModule(mod) && !shadowUnlocked) {
    return (
      <ResellerErpShell title={mod.title}>
        <ErpJainavGate>
          <span />
        </ErpJainavGate>
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
        <ErpOperatorGate>
          <ModulePageContent />
        </ErpOperatorGate>
      </ResellerErpAccessGate>
    </Suspense>
  )
}
