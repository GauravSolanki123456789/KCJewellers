import type { Metadata } from 'next'
import { JOIN_RESELLER_PATH } from '@/lib/routes'
import { getSiteUrl } from '@/lib/site'
import JoinResellerPage from './join-reseller-client'

const site = getSiteUrl()

export const metadata: Metadata = {
  title: 'Apply as Reseller',
  description:
    'Apply to become a KC Jewellers white-label reseller. Share your own branded jewellery catalogue with customers.',
  alternates: { canonical: `${site}${JOIN_RESELLER_PATH}` },
  robots: { index: true, follow: true },
}

export default function Page() {
  return <JoinResellerPage />
}
