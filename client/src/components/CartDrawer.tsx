'use client'

import { useState } from 'react'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/hooks/useAuth'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

type Breakdown = { metal?: number; mc?: number; stone?: number; cgst?: number; sgst?: number; taxable?: number; total?: number }

type CartDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, remove, setQty } = useCart()
  const auth = useAuth()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleCheckout = () => {
    if (!auth.isAuthenticated) {
      window.location.href = `${API_URL}/auth/google`
    }
    // TODO: proceed with checkout flow
  }

  const grandTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:bg-transparent ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full md:w-96 bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 shadow-2xl flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-slate-200">Your Cart</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close cart"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-slate-500 text-sm mb-4">
            See breakdown of Metal, MC, GST for each item
          </p>
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No items in cart</div>
          ) : (
            <div className="space-y-3">
              {items.map((ci) => {
                const b = (ci.breakdown || {}) as Breakdown
                const isExpanded = expandedId === ci.id
                const lineTotal = ci.price * ci.qty
                return (
                  <div
                    key={ci.id}
                    className="rounded-lg border border-white/10 bg-slate-800/30 overflow-hidden"
                  >
                    <div className="p-4 flex flex-col gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-200 truncate">
                          {ci.item.item_name || ci.item.short_name || 'Item'}
                        </div>
                        <div className="text-sm text-yellow-500/90 font-medium mt-0.5">
                          ₹{Math.round(lineTotal).toLocaleString('en-IN')}
                          <span className="text-slate-500 font-normal ml-1">
                            (₹{Math.round(ci.price)} × {ci.qty})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center shrink-0"
                          onClick={() => setQty(ci.id, ci.qty - 1)}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium tabular-nums">{ci.qty}</span>
                        <button
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center shrink-0"
                          onClick={() => setQty(ci.id, ci.qty + 1)}
                        >
                          +
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm ml-auto"
                          onClick={() => remove(ci.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ci.id)}
                      className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-400 hover:text-slate-300 hover:bg-white/5 border-t border-white/5"
                    >
                      <span>View breakdown (Metal, MC, GST)</span>
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2 text-sm">
                        <div className="flex justify-between text-slate-400">
                          <span>Metal Cost</span>
                          <span className="tabular-nums">₹{Math.round((b.metal || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Making Charges</span>
                          <span className="tabular-nums">₹{Math.round((b.mc || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        {(b.stone || 0) > 0 && (
                          <div className="flex justify-between text-slate-400">
                            <span>Stone Cost</span>
                            <span className="tabular-nums">₹{Math.round((b.stone || 0) * ci.qty).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-400">
                          <span>CGST</span>
                          <span className="tabular-nums">₹{Math.round((b.cgst || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>SGST</span>
                          <span className="tabular-nums">₹{Math.round((b.sgst || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between font-medium text-slate-200 pt-2 border-t border-white/5">
                          <span>Line Total</span>
                          <span className="tabular-nums text-yellow-500/90">₹{Math.round(lineTotal).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-slate-800 space-y-3">
            <div className="flex justify-between text-lg font-semibold">
              <span>Grand Total</span>
              <span className="text-yellow-500/90 tabular-nums">₹{Math.round(grandTotal).toLocaleString('en-IN')}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full py-3 gold-bg text-slate-950 font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              {auth.isAuthenticated ? 'Proceed to Checkout' : 'Sign In to Checkout'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
