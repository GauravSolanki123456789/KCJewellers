import type { Metadata } from 'next'
import PricelistPublicClient from './pricelist-client'

export const metadata: Metadata = {
  title: 'Shared pricelist — KC Jewellers',
  description: 'B2B pricelist shared via WhatsApp',
  robots: { index: false, follow: false },
}

export default function PricelistPublicPage() {
  return <PricelistPublicClient />
}
