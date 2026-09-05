'use client'

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import { Download, FileText, Loader2, Search } from 'lucide-react'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls, type ErpCustomer } from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { downloadCustomerAccountPdf } from '@/lib/erp-ledger-statement-pdf'
import { formatLedgerTransactionKind } from '@/lib/erp-ledger-labels'

export type CustomerAccountTx = {
  date: string
  kind: string
  ref: string
  description: string
  debit: number
  credit: number
  balance_inr: number
  lane?: string
}

export type CustomerAccountData = {
  customer: ErpCustomer
  summary: {
    total_billed_inr: number
    total_paid_inr: number
    balance_due_inr: number
    transaction_count: number
  }
  transactions: CustomerAccountTx[]
}

type Props = {
  laneMode?: boolean
  from: string
  to: string
  onCustomerSelected?: (customerId: number | null) => void
}

export function ErpCustomerAccountPanel({ laneMode = false, from, to, onCustomerSelected }: Props) {
  const [q, setQ] = useState('')
  const [pickIdx, setPickIdx] = useState(-1)
  const [results, setResults] = useState<ErpCustomer[]>([])
  const [selected, setSelected] = useState<ErpCustomer | null>(null)
  const [account, setAccount] = useState<CustomerAccountData | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (!q.trim()) {
        setResults([])
        return
      }
      void axios
        .get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', { params: { q: q.trim() } })
        .then((r) => setResults(r.data.customers || []))
        .catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const loadAccount = useCallback(
    async (customer: ErpCustomer) => {
      setBusy(true)
      setMsg(null)
      try {
        const path = laneMode
          ? '/api/reseller/erp/shadow/customer-account'
          : '/api/reseller/erp/ledger/customer-account'
        const res = await axios.get<CustomerAccountData>(path, {
          params: { customer_id: customer.id, from, to },
        })
        setAccount(res.data)
        setSelected(customer)
        onCustomerSelected?.(customer.id)
      } catch (e) {
        setMsg(erpErr(e))
        setAccount(null)
      } finally {
        setBusy(false)
      }
    },
    [laneMode, from, to, onCustomerSelected],
  )

  const pickCustomer = (c: ErpCustomer) => {
    setQ(c.name)
    setResults([])
    setPickIdx(-1)
    void loadAccount(c)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const list = results.slice(0, 8)
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickIdx((i) => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && pickIdx >= 0 && pickIdx < list.length) {
      e.preventDefault()
      pickCustomer(list[pickIdx])
    }
  }

  const exportAccount = async (format: 'csv' | 'pdf') => {
    if (!selected || !account) return
    setBusy(true)
    try {
      if (format === 'pdf') {
        await downloadCustomerAccountPdf(account)
        setMsg('PDF downloaded.')
      } else {
        const path = laneMode
          ? '/api/reseller/erp/shadow/customer-account/export'
          : '/api/reseller/erp/ledger/customer-account/export'
        const res = await axios.get(path, {
          params: { customer_id: selected.id, from, to, format: 'csv' },
          responseType: 'blob',
        })
        const url = URL.createObjectURL(res.data)
        const a = document.createElement('a')
        a.href = url
        a.download = `payment ledger-${selected.name.replace(/\W+/g, '_')}.csv`
        a.click()
        URL.revokeObjectURL(url)
        setMsg('Excel (CSV) downloaded.')
      }
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setSelected(null)
    setAccount(null)
    setQ('')
    onCustomerSelected?.(null)
  }

  return (
    <div className={`${erpCardCls} space-y-3`}>
      <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
        {laneMode ? 'Customer payment ledger' : 'Customer payment ledger'}
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-jewelry-black,#1a1814)]/40" />
        <input
          className={`${erpInputCls} pl-9`}
          placeholder="Search customer by name or mobile…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPickIdx(-1)
          }}
          onKeyDown={onKeyDown}
        />
        {results.length > 0 && q.trim() && !selected ? (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
            {results.slice(0, 8).map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2.5 text-left text-sm ${
                    i === pickIdx ? 'bg-[var(--kc-accent,#c41e3a)]/10' : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                  }`}
                  onClick={() => pickCustomer(c)}
                >
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{c.name}</span>
                  {c.mobile ? (
                    <span className="ml-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{c.mobile}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {selected ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{selected.name}</span>
          {selected.mobile ? <span className="text-[var(--color-jewelry-black,#1a1814)]/50">{selected.mobile}</span> : null}
          <button type="button" className="text-[var(--kc-accent,#c41e3a)] underline" onClick={clear}>
            Clear
          </button>
        </div>
      ) : null}

      {account ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { l: 'Total billed', v: formatErpInr(account.summary.total_billed_inr) },
              { l: 'Total paid', v: formatErpInr(account.summary.total_paid_inr) },
              {
                l: 'Balance due',
                v: formatErpInr(account.summary.balance_due_inr),
                accent: account.summary.balance_due_inr > 0,
              },
            ].map((c) => (
              <div key={c.l} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{c.l}</p>
                <p
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    c.accent ? 'text-[var(--kc-accent,#c41e3a)]' : 'text-[var(--color-jewelry-black,#1a1814)]'
                  }`}
                >
                  {c.v}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void exportAccount('csv')}>
              <Download className="size-4" />
              Excel (CSV)
            </button>
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void exportAccount('pdf')}>
              <FileText className="size-4" />
              PDF download
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Bill / ref</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-right">Debit</th>
                  <th className="px-3 py-2.5 text-right">Credit</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {account.transactions.map((t, i) => (
                  <tr key={`${t.date}-${t.ref}-${i}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="whitespace-nowrap px-3 py-2">{t.date}</td>
                    <td className="px-3 py-2">{formatLedgerTransactionKind(t.kind)}</td>
                    <td className="px-3 py-2 font-mono">{t.ref || '—'}</td>
                    <td className="max-w-[140px] truncate px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.debit ? formatErpInr(t.debit) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.credit ? formatErpInr(t.credit) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatErpInr(t.balance_inr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : busy ? (
        <p className="flex items-center gap-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : null}

      {msg ? <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/65">{msg}</p> : null}
    </div>
  )
}
