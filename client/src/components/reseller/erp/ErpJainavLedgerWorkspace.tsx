'use client'

import { ErpLedgerWorkspace } from '@/components/reseller/erp/ErpLedgerWorkspace'

/** Full ledger UI with GST + Jainav customer accounts — Jainav mode only. */
export function ErpJainavLedgerWorkspace() {
  return <ErpLedgerWorkspace laneMode />
}
