import type { Metadata } from 'next'
import ResellerInvestPageClient from './page-client'

export const metadata: Metadata = {
  title: 'Record Invest payments',
  robots: { index: false, follow: false },
}

export default function ResellerInvestPage() {
  return <ResellerInvestPageClient />
}
