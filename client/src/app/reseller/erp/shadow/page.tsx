import type { Metadata } from 'next'
import ErpShadowPageClient from './page-client'

export const metadata: Metadata = {
  title: 'Internal ledger · ERP',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ErpShadowPageClient />
}
