import { CatalogDataProvider } from '@/app/catalog/catalog-data-context'
import WholesaleOrderClient from './wholesale-order-client'

export const metadata = {
  title: 'Wholesale quick order',
  description: 'Dense SKU matrix for B2B buyers — KC Jewellers',
}

export default function WholesaleOrderPage() {
  return (
    <CatalogDataProvider>
      <WholesaleOrderClient />
    </CatalogDataProvider>
  )
}
