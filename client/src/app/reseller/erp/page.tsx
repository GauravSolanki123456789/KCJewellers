import type { Metadata } from 'next'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import ResellerErpHubPageClient from './page-client'

const site = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://kcjewellers.co.in'

export const metadata: Metadata = {
  title: 'Jewellery ERP · Reseller',
  robots: { index: false, follow: false },
  alternates: { canonical: `${site}${RESELLER_ERP_PATH}` },
}

export default function Page() {
  return <ResellerErpHubPageClient />
}
