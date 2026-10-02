import type { Metadata, Viewport } from 'next'
import { DigiPwaRegister } from '@/components/digi/DigiPwaRegister'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#c41e3a',
}

export const metadata: Metadata = {
  title: 'DigiGold & DigiSilver',
  description: 'Buy digital gold and silver, save monthly, and redeem at your jeweller.',
  applicationName: 'DigiGold & DigiSilver',
  manifest: '/digi-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'DigiGold',
    statusBarStyle: 'default',
  },
}

export default function DigiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DigiPwaRegister />
      {children}
    </>
  )
}
