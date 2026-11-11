import type { Metadata } from 'next'
import { RESELLER_KUMUDU_STOCK_LINK_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import KumuduStockLinkPageClient from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Kumudu software stock link · Reseller', RESELLER_KUMUDU_STOCK_LINK_PATH)
}

export default function Page() {
  return <KumuduStockLinkPageClient />
}
