import type { Metadata } from 'next'
import { RESELLER_ERP_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import ResellerErpHubPageClient from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Jewellery ERP · Reseller', RESELLER_ERP_PATH)
}

export default function Page() {
  return <ResellerErpHubPageClient />
}
