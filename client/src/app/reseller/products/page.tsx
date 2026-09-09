import type { Metadata } from 'next'
import { RESELLER_PRODUCTS_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import ResellerProductsPage from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Upload products · Reseller', RESELLER_PRODUCTS_PATH)
}

export default function Page() {
  return <ResellerProductsPage />
}
