import type { Metadata } from 'next'
import { RESELLER_OWN_PRICES_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import ResellerOwnPricesPageClient from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Your prices · Reseller', RESELLER_OWN_PRICES_PATH)
}

export default function Page() {
  return <ResellerOwnPricesPageClient />
}
