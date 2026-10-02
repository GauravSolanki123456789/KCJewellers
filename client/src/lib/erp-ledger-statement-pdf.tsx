import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import type { CustomerAccountData } from '@/components/reseller/erp/ErpCustomerAccountPanel'
import { formatLedgerTransactionKind, formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatMetalGm, metalBalanceHint, formatLedgerDebitCell, formatLedgerBalanceCell, formatLedgerVirtualMetalCredit } from '@/lib/erp-ledger-metal'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { sanitizePdfText } from '@/lib/pdf-text-utils'

function pdfLedgerDescription(raw: string): string {
  return String(raw || '')
    .replace(/\u00b9/g, '')
    .replace(/\s*[—–-]\s*₹?\s*offset only.*$/gi, '')
    .replace(/\s*offset only.*$/gi, '')
    .trim()
}

export type CustomerAccountPdfMeta = {
  shopName: string
  /** ISO yyyy-mm-dd or already formatted */
  fromDate?: string | null
  toDate?: string | null
  /** Single-day filter (ISO) */
  onDate?: string | null
  /** Jainav / lane customer ledger shows metal in running balance; official is ₹ only. */
  laneLedger?: boolean
}

function pdfDateLabel(isoOrDisplay: string | null | undefined): string {
  if (!isoOrDisplay) return '—'
  const s = String(isoOrDisplay).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatErpDateDdMmYyyy(s)
  return s
}

function ledgerPeriodLabel(meta: CustomerAccountPdfMeta): string {
  if (meta.onDate) {
    const d = pdfDateLabel(meta.onDate)
    return `from ${d} to ${d}`
  }
  const from = pdfDateLabel(meta.fromDate)
  const to = pdfDateLabel(meta.toDate)
  if (from !== '—' && to !== '—') return `from ${from} to ${to}`
  if (from !== '—') return `from ${from}`
  if (to !== '—') return `to ${to}`
  return ''
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  shopName: { fontSize: 14, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' },
  title: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  sub: { fontSize: 9, color: '#444', marginBottom: 12, textAlign: 'center' },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 90, fontWeight: 'bold' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 4,
    marginTop: 12,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  c1: { width: '14%' },
  c2: { width: '12%' },
  c3: { width: '14%' },
  c4: { width: '20%' },
  cW: { width: '10%', textAlign: 'right' },
  c5: { width: '10%', textAlign: 'right' },
  c6: { width: '10%', textAlign: 'right' },
  c7: { width: '12%', textAlign: 'right' },
})

function LedgerStatementDocument({
  account,
  meta,
}: {
  account: CustomerAccountData
  meta: CustomerAccountPdfMeta
}) {
  const shop = sanitizePdfText(meta.shopName || 'Shop')
  const customer = sanitizePdfText(account.customer.name || 'Customer')
  const period = ledgerPeriodLabel(meta)
  const headline = period
    ? `Ledger of ${customer} ${period}`
    : `Ledger of ${customer}`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.shopName}>{shop.toUpperCase()}</Text>
        <Text style={styles.title}>{headline}</Text>
        {account.customer.mobile ? (
          <Text style={styles.sub}>Mobile: {account.customer.mobile}</Text>
        ) : null}
        <View style={styles.row}>
          <Text style={styles.label}>Balance due</Text>
          <Text>{formatPdfInr(account.summary.balance_due_inr)}</Text>
        </View>
        {account.summary.metal_balance_gm != null && Math.abs(account.summary.metal_balance_gm) >= 0.0005 ? (
          <View style={styles.row}>
            <Text style={styles.label}>Metal</Text>
            <Text>
              {formatMetalGm(account.summary.metal_balance_gm)} ({metalBalanceHint(account.summary.metal_balance_gm)})
            </Text>
          </View>
        ) : null}
        <View style={styles.tableHeader}>
          <Text style={styles.c1}>Date</Text>
          <Text style={styles.c2}>Type</Text>
          <Text style={styles.c3}>Ref</Text>
          <Text style={styles.c4}>Description</Text>
          <Text style={styles.cW}>Weight</Text>
          <Text style={styles.c5}>Debit</Text>
          <Text style={styles.c6}>Credit</Text>
          <Text style={styles.c7}>Balance</Text>
        </View>
        {account.transactions.map((t, i) => (
          <View key={`${t.ref}-${i}`} style={styles.tableRow}>
            <Text style={styles.c1}>{pdfDateLabel(t.date)}</Text>
            <Text style={styles.c2}>{formatLedgerTransactionKind(t.kind)}</Text>
            <Text style={styles.c3}>{t.ref || '—'}</Text>
            <Text style={styles.c4}>{pdfLedgerDescription(t.description)}</Text>
            <Text style={styles.cW}>
              {t.weight_gm && t.weight_gm > 0 ? `${t.weight_gm.toFixed(3)} g` : '—'}
            </Text>
            <Text style={styles.c5}>{formatLedgerDebitCell(t)}</Text>
            <Text style={styles.c6}>
              {formatLedgerVirtualMetalCredit({
                virtual_metal_inr: t.virtual_metal_inr,
                virtual_metal_show_inr_credit: t.virtual_metal_show_inr_credit,
                credit: t.credit,
                weight_gm: t.weight_gm,
                credit_metal_gm: t.credit_metal_gm,
              })}
            </Text>
            <Text style={styles.c7}>
              {formatLedgerBalanceCell(t.balance_inr, t.balance_metal_gm, {
                laneLedger: !!meta.laneLedger,
              })}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadCustomerAccountPdf(
  account: CustomerAccountData,
  meta: CustomerAccountPdfMeta,
) {
  const blob = await pdf(<LedgerStatementDocument account={account} meta={meta} />).toBlob()
  const fname = `ledger-${account.customer.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: meta.shopName ? `${meta.shopName} — customer ledger` : 'Customer ledger',
    text: fname,
    customerMobile: account.customer.mobile ?? null,
  })
}

export type DaybookExportData = {
  date: string
  lane_view?: boolean
  summary: {
    received_inr?: number
    paid_out_inr?: number
    net_inr?: number
    total_debit_inr?: number
    total_credit_inr?: number
    closing_balance_inr?: number
    total_debit_metal_gm?: number
    total_credit_metal_gm?: number
    closing_balance_metal_gm?: number
    transaction_count: number
  }
  transactions: {
    entry_date: string
    kind: string
    customer_name: string
    payment_mode: string
    reference: string
    amount_inr?: number
    debit_inr?: number
    credit_inr?: number
    balance_inr?: number
    debit_metal_gm?: number
    credit_metal_gm?: number
    balance_metal_gm?: number
    weight_gm?: number
    description?: string
    source?: string
    metal_ledger_mode?: boolean
    shadow_bill_id?: number | null
  }[]
}

function DaybookDocument({ data }: { data: DaybookExportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Day book</Text>
        <Text style={styles.sub}>{data.date}{data.lane_view ? ' (lane ledger)' : ''}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Total debit</Text>
          <Text>{formatPdfInr(data.summary.total_debit_inr ?? 0)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total credit</Text>
          <Text>{formatPdfInr(data.summary.total_credit_inr ?? 0)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Closing balance</Text>
          <Text>{formatPdfInr(data.summary.closing_balance_inr ?? 0)}</Text>
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.c1}>Date</Text>
          <Text style={styles.c2}>Type</Text>
          <Text style={styles.c3}>Party</Text>
          <Text style={styles.c4}>Reference</Text>
          <Text style={styles.c5}>Debit</Text>
          <Text style={styles.c6}>Credit</Text>
          <Text style={styles.c7}>Balance</Text>
        </View>
        {data.transactions.map((t, i) => (
          <View key={`${t.reference}-${i}`} style={styles.tableRow}>
            <Text style={styles.c1}>{t.entry_date}</Text>
            <Text style={styles.c2}>{formatLedgerTransactionKind(t.kind)}</Text>
            <Text style={styles.c3}>{t.customer_name}</Text>
            <Text style={styles.c4}>{t.reference || '—'}</Text>
            <Text style={styles.c5}>
              {formatLedgerDebitCell({
                debit_inr: t.debit_inr,
                debit_metal_gm: t.debit_metal_gm,
                weight_gm: t.weight_gm,
                source: t.source,
                metal_ledger_mode: t.metal_ledger_mode,
                shadow_bill_id: t.shadow_bill_id,
                kind: t.kind,
              })}
            </Text>
            <Text style={styles.c6}>
              {t.credit_inr
                ? formatPdfInr(t.credit_inr)
                : t.credit_metal_gm
                  ? `${Number(t.credit_metal_gm).toFixed(3)} g`
                  : '—'}
            </Text>
            <Text style={styles.c7}>
              {formatLedgerBalanceCell(t.balance_inr, t.balance_metal_gm, {
                laneLedger: !!data.lane_view,
              })}
            </Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadDaybookPdf(data: DaybookExportData) {
  const blob = await pdf(<DaybookDocument data={data} />).toBlob()
  const fname = `daybook-${data.date}${data.lane_view ? '-lane' : ''}.pdf`
  await presentPdfBlob(blob, fname, {
    title: 'Day book',
    text: fname,
    customerMobile: null,
  })
}
