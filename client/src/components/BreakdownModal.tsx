'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'
import { X, FileDown, User, Phone } from 'lucide-react'

type Breakdown = {
  metal?: number
  mc?: number
  stone?: number
  cgst?: number
  sgst?: number
  taxable?: number
  total?: number
  originalTotal?: number
  discountPercent?: number
  items?: unknown[]
}

type BreakdownModalProps = {
  open: boolean
  onClose: () => void
  breakdown: Breakdown | null
  productName?: string
  isDiamond?: boolean
}

export default function BreakdownModal({ open, onClose, breakdown, productName, isDiamond }: BreakdownModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [quotationNo, setQuotationNo] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuotationNo(null)
    }
  }, [open])

  if (!open) return null
  if (!breakdown) return null

  const metal = Math.round(breakdown.metal ?? 0)
  const mc = Math.round(breakdown.mc ?? 0)
  const stone = Math.round(breakdown.stone ?? 0)
  const cgst = Math.round(breakdown.cgst ?? 0)
  const sgst = Math.round(breakdown.sgst ?? 0)
  const total = Math.round(breakdown.total ?? 0)
  const hasDiscount = (breakdown.discountPercent ?? 0) > 0
  const originalTotal = breakdown.originalTotal ? Math.round(breakdown.originalTotal) : null

  const handlePrint = async () => {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    try {
      const resp = await axios.post(`${url}/api/quotations/issue`, {
        customer_name: customerName || undefined,
        customer_mobile: customerMobile || undefined,
        items: breakdown.items ?? [],
        totals: {
          total: breakdown.total,
          gst: (breakdown.cgst || 0) + (breakdown.sgst || 0),
          net_total: breakdown.total,
          final_amount: breakdown.total,
        },
      })
      const qn = resp.data?.quotation_no
      if (qn) setQuotationNo(qn)
    } catch {
      // Continue to print even if API fails
    }
    window.print()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm no-print"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakdown-title"
      >
        <div
          className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between p-4 border-b border-slate-700/80 bg-slate-900 z-10">
            <h2 id="breakdown-title" className="text-lg font-semibold text-slate-100">Price Breakdown</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            {/* Optional product context */}
            {productName && (
              <p className="text-sm text-slate-400 truncate">{productName}</p>
            )}

            {/* Customer details (optional, for quotation) */}
            <div className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                For Quotation (optional)
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Customer Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Enter name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
                    <input
                      type="tel"
                      placeholder="Enter mobile"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown table — diamond: Price, CGST, SGST, Line Total only */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 overflow-hidden">
              <div className="divide-y divide-slate-700/60">
                {!isDiamond && (
                  <>
                    <div className="flex justify-between items-center px-4 py-3">
                      <span className="text-slate-300">Metal Cost</span>
                      <span className="font-medium tabular-nums text-slate-100">₹{metal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-3">
                      <span className="text-slate-300">Making Charges</span>
                      <span className="font-medium tabular-nums text-slate-100">₹{mc.toLocaleString('en-IN')}</span>
                    </div>
                    {stone > 0 && (
                      <div className="flex justify-between items-center px-4 py-3">
                        <span className="text-slate-300">Stone Cost</span>
                        <span className="font-medium tabular-nums text-slate-100">₹{stone.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                )}
                {isDiamond && (
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-slate-300">Price</span>
                    <span className="font-medium tabular-nums text-slate-100">₹{Math.round(breakdown.taxable ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-slate-300">CGST</span>
                  <span className="font-medium tabular-nums text-slate-100">₹{cgst.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <span className="text-slate-300">SGST</span>
                  <span className="font-medium tabular-nums text-slate-100">₹{sgst.toLocaleString('en-IN')}</span>
                </div>
              </div>
              {hasDiscount && originalTotal != null && (
                <div className="flex justify-between items-center px-4 py-2 bg-slate-800/80 border-t border-slate-700/60">
                  <span className="text-slate-400 text-sm">Original</span>
                  <span className="text-slate-500 line-through tabular-nums">₹{originalTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-4 bg-amber-500/10 border-t-2 border-amber-500/30">
                <span className="font-semibold text-slate-100">Total</span>
                <span className="text-xl font-bold tabular-nums text-amber-500">₹{total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 hover:border-slate-500 transition-colors"
              >
                <FileDown className="size-4" />
                Export / Print
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print-only content */}
      <div className="print-only print-breakdown hidden">
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>KC Jewellers</div>
          <div style={{ fontSize: 12 }}>Quotation: {quotationNo || '-'}</div>
        </div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>51/1 OVM Street, Triplicane, Chennai-600005</div>
        {customerName && (
          <div style={{ fontSize: 12, marginBottom: 6 }}>
            Customer: {customerName} {customerMobile ? `(${customerMobile})` : ''}
          </div>
        )}
        {productName && <div style={{ fontSize: 12, marginBottom: 6 }}>Product: {productName}</div>}
        {!isDiamond && (
          <>
            <div className="row">
              <span>Metal Cost</span>
              <span>₹{metal.toLocaleString('en-IN')}</span>
            </div>
            <div className="row">
              <span>Making Charges</span>
              <span>₹{mc.toLocaleString('en-IN')}</span>
            </div>
            {stone > 0 && (
              <div className="row">
                <span>Stone Cost</span>
                <span>₹{stone.toLocaleString('en-IN')}</span>
              </div>
            )}
          </>
        )}
        {isDiamond && (
          <div className="row">
            <span>Price</span>
            <span>₹{Math.round(breakdown.taxable ?? 0).toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="row">
          <span>CGST</span>
          <span>₹{cgst.toLocaleString('en-IN')}</span>
        </div>
        <div className="row">
          <span>SGST</span>
          <span>₹{sgst.toLocaleString('en-IN')}</span>
        </div>
        <div className="row" style={{ borderTop: '1px solid #000', paddingTop: 6, fontWeight: 600 }}>
          <span>Total</span>
          <span>₹{total.toLocaleString('en-IN')}</span>
        </div>
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12 }}>Customer Signature: ______________________</div>
          <div style={{ fontSize: 12 }}>Authorized Signature: ______________________</div>
        </div>
      </div>
    </>
  )
}
