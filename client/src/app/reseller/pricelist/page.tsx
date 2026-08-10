import type { Metadata } from 'next'
import ResellerPricelistPageClient from './page-client'

export const metadata: Metadata = {
  title: 'B2B Pricelist — KC Jewellers',
  description: 'Manage B2B pricelist categories, Excel uploads, and WhatsApp share links.',
}

export default function ResellerPricelistPage() {
  return <ResellerPricelistPageClient />
}
