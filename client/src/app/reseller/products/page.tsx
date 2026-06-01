import type { Metadata } from 'next'
import { RESELLER_PRODUCTS_PATH } from '@/lib/routes'
import ResellerProductsPage from './page-client'

const site = process.env.NEXT_PUBLIC_CLIENT_URL || 'https://kcjewellers.co.in'

export const metadata: Metadata = {
  title: 'Upload products · Reseller',
  robots: { index: false, follow: false },
  alternates: { canonical: `${site}${RESELLER_PRODUCTS_PATH}` },
}

export default function Page() {
  return <ResellerProductsPage />
}
