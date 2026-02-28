'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useMemo } from 'react'
import axios from 'axios'
import { useState } from 'react'

export default function BreakdownModal({ open, onClose, breakdown }: { open: boolean, onClose: () => void, breakdown: any }) {
  useEffect(() => {
    if (!open) return
  }, [open])
  const [customerName, setCustomerName] = useState<string>('')
  const [customerMobile, setCustomerMobile] = useState<string>('')
  const [quotationNo, setQuotationNo] = useState<string | null>(null)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 no-print">
      <div className="glass-card w-full sm:w-[480px] p-4">
        <div className="text-xl font-semibold mb-4">Estimation Breakdown</div>
        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <input placeholder="Customer Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="flex-1 glass-card py-2 px-3" />
          </div>
          <div className="flex gap-2">
            <input placeholder="Customer Mobile" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} className="flex-1 glass-card py-2 px-3" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between"><span>Metal Cost</span><span>₹{Math.round(breakdown.metal)}</span></div>
          <div className="flex justify-between"><span>Making Charges</span><span>₹{Math.round(breakdown.mc)}</span></div>
          <div className="flex justify-between"><span>Stone Cost</span><span>₹{Math.round(breakdown.stone)}</span></div>
          <div className="flex justify-between"><span>CGST</span><span>₹{Math.round(breakdown.cgst)}</span></div>
          <div className="flex justify-between"><span>SGST</span><span>₹{Math.round(breakdown.sgst)}</span></div>
          <div className="border-t border-white/10 pt-2 flex justify-between font-semibold"><span>Total</span><span>₹{Math.round(breakdown.total)}</span></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={async () => {
            const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
            try {
              const resp = await axios.post(`${url}/api/quotations/issue`, {
                customer_name: customerName || undefined, customer_mobile: customerMobile || undefined,
                items: breakdown?.items || [], totals: {
                  total: breakdown.total, gst: (breakdown.cgst || 0) + (breakdown.sgst || 0),
                  net_total: breakdown.total, final_amount: breakdown.total
                }
              })
              const qn = resp.data?.quotation_no
              if (qn) setQuotationNo(qn)
            } catch {}
            window.print()
          }}>Export / Print</Button>
          <Button className="gold-bg text-black" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="print-only print-breakdown">
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>KC Jewellers</div>
          <div style={{ fontSize: 12 }}>Quotation: {quotationNo || '-'}</div>
        </div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>51/1 OVM Street, Triplicane, Chennai-600005</div>
        {customerName && <div style={{ fontSize: 12, marginBottom: 6 }}>Customer: {customerName} {customerMobile ? `(${customerMobile})` : ''}</div>}
        <div className="row"><span>Metal Cost</span><span>₹{Math.round(breakdown.metal)}</span></div>
        <div className="row"><span>Making Charges</span><span>₹{Math.round(breakdown.mc)}</span></div>
        <div className="row"><span>Stone Cost</span><span>₹{Math.round(breakdown.stone)}</span></div>
        <div className="row"><span>CGST</span><span>₹{Math.round(breakdown.cgst)}</span></div>
        <div className="row"><span>SGST</span><span>₹{Math.round(breakdown.sgst)}</span></div>
        <div className="row" style={{ borderTop: '1px solid #000', paddingTop: 6, fontWeight: 600 }}>
          <span>Total</span><span>₹{Math.round(breakdown.total)}</span>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12 }}>Customer Signature: ______________________</div>
          <div style={{ fontSize: 12 }}>Authorized Signature: ______________________</div>
        </div>
      </div>
    </div>
  )
}
