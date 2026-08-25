import type { Metadata } from 'next'
import ErpShadowPageClient from './page-client'

export const metadata: Metadata = {
  title: 'Jainav · ERP',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <ErpShadowPageClient />
}
