'use client'

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import { cachedGet } from '@/lib/api-get-cache'
import { isOfflineOrNetworkError, searchOfflineCustomers } from '@/lib/erp-offline-store'
import { erpInputCls, type ErpCustomer } from '@/components/reseller/erp/erp-ui'

type Props = {
  customerId: number | null
  customerName: string
  onQueryChange: (query: string) => void
  onSelect: (customer: ErpCustomer) => void
  onClearLink?: () => void
  placeholder?: string
  className?: string
  inputClassName?: string
  onAfterSelect?: () => void
}

export function ErpCustomerSuggestField({
  customerId,
  customerName,
  onQueryChange,
  onSelect,
  onClearLink,
  placeholder = 'Search or type name',
  className = '',
  inputClassName = '',
  onAfterSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [pickIdx, setPickIdx] = useState(-1)

  const displayValue = customerId != null && customerName ? customerName : query || customerName

  const loadCustomers = useCallback(async (q: string) => {
    const params = q.trim() ? { q: q.trim() } : {}
    const cacheKey = `/api/reseller/erp/customers?${JSON.stringify(params)}`
    try {
      const res = await cachedGet(cacheKey, () =>
        axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', { params }),
        30000,
      )
      setCustomers(res.data.customers || [])
    } catch (e) {
      if (isOfflineOrNetworkError(e)) {
        setCustomers(await searchOfflineCustomers(q))
        return
      }
      setCustomers([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(query), 250)
    return () => clearTimeout(t)
  }, [query, loadCustomers])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = customers.slice(0, 8)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (query.trim() && list.length > 0) {
        const idx = pickIdx >= 0 && pickIdx < list.length ? pickIdx : 0
        onSelect(list[idx]!)
        setQuery('')
        setPickIdx(-1)
        onAfterSelect?.()
      }
      return
    }
    if (!query.trim() || !list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickIdx((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Escape') {
      setPickIdx(-1)
      setQuery('')
    }
  }

  const showList = query.trim().length > 0 && customers.length > 0

  return (
    <div className={`relative ${className}`}>
      <input
        className={`${erpInputCls} ${inputClassName}`}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          const v = e.target.value
          setQuery(v)
          onQueryChange(v)
          onClearLink?.()
          setPickIdx(-1)
        }}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
          {customers.slice(0, 8).map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`w-full px-3 py-2 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--kc-accent,#c41e3a)]/[0.06] ${
                  pickIdx === i ? 'bg-[var(--kc-accent,#c41e3a)]/[0.08]' : ''
                }`}
                onMouseEnter={() => setPickIdx(i)}
                onClick={() => {
                  onSelect(c)
                  setQuery('')
                  setPickIdx(-1)
                  onAfterSelect?.()
                }}
              >
                {c.name}
                {c.mobile ? (
                  <span className="text-[var(--color-jewelry-black,#1a1814)]/45"> · {c.mobile}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
