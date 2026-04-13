/** User-facing copy for `orders` rows (retail + B2B). */

export type OrderStatusInput = {
  payment_status?: string | null
  delivery_status?: string | null
  order_channel?: string | null
}

export function describeOrderStatusForCustomer(o: OrderStatusInput): { label: string; hint?: string } {
  const channel = String(o.order_channel || 'RETAIL').toUpperCase()
  const pay = String(o.payment_status || '').toUpperCase()
  const del = String(o.delivery_status || 'PENDING').toUpperCase()

  if (channel === 'B2B_WHOLESALE') {
    if (pay === 'PENDING_APPROVAL') {
      return {
        label: 'Awaiting confirmation',
        hint: 'We verify NEFT/ledger before dispatch.',
      }
    }
  }
  if (pay === 'PENDING') {
    return {
      label: 'Payment pending',
      hint: 'Complete payment so we can process your order.',
    }
  }
  if (pay === 'VOID' || pay === 'FAILED') {
    return { label: 'Payment issue', hint: 'Contact us if you were charged.' }
  }

  const ship: Record<string, { label: string; hint?: string }> = {
    PENDING: { label: 'Processing', hint: 'We are confirming your order.' },
    NEW: { label: 'Processing' },
    ACCEPTED: { label: 'Accepted', hint: 'We are preparing your items.' },
    READY: { label: 'Ready', hint: 'Slated for dispatch soon.' },
    DISPATCHED: { label: 'Dispatched', hint: 'On the way to you.' },
    DELIVERED: { label: 'Delivered' },
    CANCELLED: { label: 'Cancelled' },
  }
  const row = ship[del]
  if (row) return row

  if (pay === 'PAID' || pay === 'SIP_AND_RAZORPAY' || pay === 'SIP_REDEMPTION') {
    return { label: 'Paid · in progress', hint: 'Your payment is received.' }
  }
  return { label: pay || '—' }
}
