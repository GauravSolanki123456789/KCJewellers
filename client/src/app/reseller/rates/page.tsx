import type { Metadata } from 'next'
import { RESELLER_RATES_PATH } from '@/lib/routes'
import ResellerRatesPageClient from './page-client'

const site = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://kcjewellers.co.in'

export const metadata: Metadata = {
  title: 'Update rates · Reseller',
  robots: { index: false, follow: false },
  alternates: { canonical: `${site}${RESELLER_RATES_PATH}` },
}

export default function Page() {
  return <ResellerRatesPageClient />
}
