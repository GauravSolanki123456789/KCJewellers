import { notFound } from 'next/navigation'
import { DigiPurchaseClient } from './digi-purchase-client'

type Props = { params: Promise<{ metal: string }> }

export default async function DigiPurchasePage({ params }: Props) {
  const { metal } = await params
  const m = metal?.toLowerCase()
  if (m !== 'gold' && m !== 'silver') notFound()
  return <DigiPurchaseClient metal={m} />
}
