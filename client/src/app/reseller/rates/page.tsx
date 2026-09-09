import type { Metadata } from 'next'
import { RESELLER_RATES_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import ResellerRatesPageClient from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Update rates · Reseller', RESELLER_RATES_PATH)
}

export default function Page() {
  return <ResellerRatesPageClient />
}
