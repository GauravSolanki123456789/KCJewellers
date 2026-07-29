import type { Metadata } from 'next'
import { RESELLER_MC_SLABS_PATH } from '@/lib/routes'
import ResellerMcSlabsPageClient from './page-client'

const site = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://kcjewellers.co.in'

export const metadata: Metadata = {
  title: 'Upload slabs · Reseller',
  robots: { index: false, follow: false },
  alternates: { canonical: `${site}${RESELLER_MC_SLABS_PATH}` },
}

export default function Page() {
  return <ResellerMcSlabsPageClient />
}
