import type { Metadata } from 'next'
import ResellerErpModulePageClient from './page-client'

export const metadata: Metadata = {
  title: 'ERP module · Reseller',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ResellerErpModulePageClient />
}
