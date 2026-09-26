/** Reverse 3% GST from a GST-inclusive rupee total (for bill PDF when GST toggle is off). */
export function erpInclusiveGstSplit(netInr: number): {
  taxable: number
  gst: number
  cgst: number
  sgst: number
  igst: number
} {
  const net = Math.round(Number(netInr) || 0)
  if (net <= 0) {
    return { taxable: 0, gst: 0, cgst: 0, sgst: 0, igst: 0 }
  }
  const taxable = Math.round((net / 1.03) * 100) / 100
  const gst = Math.round((net - taxable) * 100) / 100
  const half = Math.round((gst / 2) * 100) / 100
  return { taxable, gst, cgst: half, sgst: half, igst: gst }
}
