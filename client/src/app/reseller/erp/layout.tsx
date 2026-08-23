'use client'

import { ErpOperatorProvider } from '@/context/ErpOperatorContext'
import type { ReactNode } from 'react'

export default function ResellerErpLayout({ children }: { children: ReactNode }) {
  return <ErpOperatorProvider>{children}</ErpOperatorProvider>
}
