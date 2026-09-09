import type { Metadata } from 'next'
import { RESELLER_MC_SLABS_PATH } from '@/lib/routes'
import { staffRouteMetadata } from '@/lib/staff-metadata'
import ResellerMcSlabsPageClient from './page-client'

export async function generateMetadata(): Promise<Metadata> {
  return staffRouteMetadata('Upload slabs · Reseller', RESELLER_MC_SLABS_PATH)
}

export default function Page() {
  return <ResellerMcSlabsPageClient />
}
