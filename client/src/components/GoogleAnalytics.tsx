'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export function GoogleAnalytics() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)
  const viewStartTime = useRef<number>(Date.now())

  useEffect(() => {
    if (!GA_ID || typeof window === 'undefined' || !(window as any).gtag) return
    const gtag = (window as any).gtag
    if (pathname !== lastPath.current) {
      lastPath.current = pathname
      gtag('config', GA_ID, { page_path: pathname })
      viewStartTime.current = Date.now()
    }
  }, [pathname])

  useEffect(() => {
    if (!GA_ID || typeof window === 'undefined') return
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (window as any).gtag) {
        const timeSpent = Math.round((Date.now() - viewStartTime.current) / 1000)
        ;(window as any).gtag('event', 'time_on_page', {
          time_seconds: timeSpent,
          page_path: pathname,
        })
      } else if (document.visibilityState === 'visible') {
        viewStartTime.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pathname])

  if (!GA_ID) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  )
}

export function trackProductView(productId: string, productName: string) {
  if (!GA_ID || typeof window === 'undefined' || !(window as any).gtag) return
  ;(window as any).gtag('event', 'view_item', {
    items: [{ item_id: productId, item_name: productName }],
  })
}

export function trackAddToCart(productId: string, productName: string, price: number) {
  if (!GA_ID || typeof window === 'undefined' || !(window as any).gtag) return
  ;(window as any).gtag('event', 'add_to_cart', {
    currency: 'INR',
    value: price,
    items: [{ item_id: productId, item_name: productName, price }],
  })
}
