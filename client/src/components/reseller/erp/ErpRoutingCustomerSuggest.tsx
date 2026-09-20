'use client'

import { useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'
import { erpInputCls } from '@/components/reseller/erp/erp-ui'

export type RoutingCustomer = { id: number; name: string; mobile?: string | null }

type Props = {
  selected: RoutingCustomer | null
  onSelect: (c: RoutingCustomer | null) => void
}

export function ErpRoutingCustomerSuggest({ selected, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RoutingCustomer[]>([])

  useEffect(() => {
    if (selected && !query.trim()) {
      setQuery(selected.mobile ? `${selected.name} · ${selected.mobile}` : selected.name)
    }
  }, [selected?.id])

  useEffect(() => {
    const q = query.trim()
    const t = window.setTimeout(() => {
      const search = q.includes('·') ? q.split('·')[0].trim() : q
      if (!search) {
        setResults([])
        return
      }
      void axios
        .get<{ customers: RoutingCustomer[] }>('/api/reseller/erp/customers', {
          params: { q: search, limit: 25 },
        })
        .then((r) => setResults(r.data.customers || []))
        .catch(() => setResults([]))
    }, 220)
    return () => window.clearTimeout(t)
  }, [query])

  const options = useMemo(
    () =>
      results.map((c) => ({
        value: c.name,
        hint: c.mobile || undefined,
      })),
    [results],
  )

  const pickByText = (text: string) => {
    const typed = text.trim()
    const digits = typed.replace(/\D/g, '')
    const byMobile =
      digits.length >= 6
        ? results.find((c) => (c.mobile || '').replace(/\D/g, '').includes(digits))
        : undefined
    const byName = results.find(
      (c) => c.name.trim().toLowerCase() === typed.toLowerCase(),
    )
    const partial =
      results.find((c) => c.name.toLowerCase().includes(typed.toLowerCase())) ||
      results[0]
    const match = byName || byMobile || (typed.length >= 2 ? partial : undefined)
    if (match) {
      onSelect(match)
      setQuery(match.mobile ? `${match.name} · ${match.mobile}` : match.name)
    } else {
      onSelect(null)
    }
  }

  return (
    <ErpBillingSuggestField
      value={query}
      placeholder="Type name or mobile…"
      options={options}
      preserveCase
      emptyText="No customers — open CRM to add"
      onChange={(v) => {
        setQuery(v)
        if (!v.trim()) onSelect(null)
      }}
      onCommit={(v) => pickByText(v)}
    />
  )
}

export const erpRoutingCustomerInputCls = erpInputCls
