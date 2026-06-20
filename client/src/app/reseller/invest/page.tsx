import { redirect } from 'next/navigation'
import { PROFILE_PATH } from '@/lib/routes'

export default function ResellerInvestPage() {
  redirect(PROFILE_PATH)
}
